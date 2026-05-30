/* eslint-disable max-lines -- Why: this file keeps Claude workflow evidence
   detection, tolerant private-file parsing, dismissal suppression, and snapshot
   emission together so the raw-hook-to-summary contract stays in one place. */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

import {
  extractClaudeWorkflowDetectorInput,
  normalizeClaudeWorkflowState,
  rollupClaudeWorkflowState,
  trimClaudeWorkflowMessage,
  type ClaudeWorkflowAgentSummary,
  type ClaudeWorkflowEvidence,
  type ClaudeWorkflowPhaseSummary,
  type ClaudeWorkflowRunSummary,
  type ClaudeWorkflowSnapshot,
  type ClaudeWorkflowState
} from '../../shared/claude-workflow-status'
import { parsePaneKey } from '../../shared/stable-pane-id'

type RawHookProcessArgs = {
  body: unknown
  connectionId: string | null
}

type LocalRunRecord = {
  summary: ClaudeWorkflowRunSummary
  evidence: ClaudeWorkflowEvidence
  directory: string | null
  suppressedIdentity: string
}

type UpdateListener = (snapshot: ClaudeWorkflowSnapshot) => void

const WORKFLOW_READ_DEBOUNCE_MS = 120
const MAX_JSON_FILE_BYTES = 2_000_000
const MAX_JSONL_TAIL_BYTES = 128_000
const MAX_JSONL_LINES = 240
const MAX_AGENTS = 200

function hashWorkflowIdentity(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24)
}

function workflowIdentity(fields: {
  connectionId: string | null
  paneKey: string
  scriptPath?: string
  runId?: string
  transcriptDir?: string
}): string {
  return [
    fields.connectionId ?? 'local',
    fields.paneKey,
    fields.scriptPath ?? '',
    fields.runId ?? '',
    fields.transcriptDir ?? ''
  ].join('\0')
}

function basenameFromLocalPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  return path.basename(path.normalize(value))
}

function resolveWorkflowDirectory(evidence: ClaudeWorkflowEvidence): string | null {
  if (evidence.transcriptDir && path.isAbsolute(evidence.transcriptDir)) {
    return path.normalize(evidence.transcriptDir)
  }
  if (evidence.scriptPath && path.isAbsolute(evidence.scriptPath)) {
    return path.dirname(path.normalize(evidence.scriptPath))
  }
  return null
}

function readJsonFile(filePath: string): unknown {
  const stat = statSync(filePath)
  if (!stat.isFile() || stat.size > MAX_JSON_FILE_BYTES) {
    return null
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function safeReadJsonFile(filePath: string): { value: unknown; error?: string } {
  try {
    return { value: readJsonFile(filePath) }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) }
  }
}

function readJsonlTail(filePath: string): { records: unknown[]; error?: string } {
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) {
      return { records: [] }
    }
    const bytesToRead = Math.min(stat.size, MAX_JSONL_TAIL_BYTES)
    const buffer = readFileSync(filePath)
    const tail = buffer.subarray(buffer.length - bytesToRead).toString('utf8')
    const lines = tail
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-MAX_JSONL_LINES)
    const records: unknown[] = []
    let malformed = 0
    for (const line of lines) {
      try {
        records.push(JSON.parse(line))
      } catch {
        malformed += 1
      }
    }
    return {
      records,
      ...(malformed > 0 ? { error: `${malformed} partial workflow preview lines skipped` } : {})
    }
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = trimClaudeWorkflowMessage(record[key])
    if (value) {
      return value
    }
  }
  return undefined
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function collectArraysByKey(
  root: unknown,
  keys: ReadonlySet<string>,
  out: unknown[][],
  depth = 0
): void {
  if (depth > 5 || out.length > 20) {
    return
  }
  if (Array.isArray(root)) {
    for (const item of root) {
      collectArraysByKey(item, keys, out, depth + 1)
    }
    return
  }
  const record = asRecord(root)
  if (!record) {
    return
  }
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key) && Array.isArray(value)) {
      out.push(value)
    } else {
      collectArraysByKey(value, keys, out, depth + 1)
    }
  }
}

function agentFromRecord(
  record: Record<string, unknown>,
  fallbackId: string,
  now: number
): ClaudeWorkflowAgentSummary | null {
  const label = readString(record, [
    'label',
    'name',
    'title',
    'agentType',
    'agent_type',
    'task',
    'description'
  ])
  const id =
    readString(record, ['id', 'agentId', 'agent_id', 'subagentId', 'subagent_id']) ?? fallbackId
  const lastMessage = readString(record, [
    'lastMessage',
    'last_message',
    'message',
    'summary',
    'preview',
    'result'
  ])
  if (!label && !lastMessage) {
    return null
  }
  const timestamp =
    readNumber(record, [
      'updatedAt',
      'updated_at',
      'completedAt',
      'completed_at',
      'startedAt',
      'started_at'
    ]) ?? now
  return {
    id,
    label: label ?? id,
    state: normalizeClaudeWorkflowState(record.state ?? record.status ?? record.resultStatus),
    startedAt:
      readNumber(record, ['startedAt', 'started_at', 'createdAt', 'created_at']) ?? timestamp,
    updatedAt: timestamp,
    lastMessage,
    tokenCount: readNumber(record, ['tokenCount', 'token_count', 'tokens']),
    phaseId: readString(record, ['phaseId', 'phase_id', 'phase'])
  }
}

function collectAgentsFromJson(root: unknown, now: number): ClaudeWorkflowAgentSummary[] {
  const arrays: unknown[][] = []
  collectArraysByKey(
    root,
    new Set(['agents', 'subagents', 'children', 'workers', 'tasks', 'steps']),
    arrays
  )
  const byId = new Map<string, ClaudeWorkflowAgentSummary>()
  let index = 0
  for (const array of arrays) {
    for (const item of array) {
      if (byId.size >= MAX_AGENTS) {
        return Array.from(byId.values())
      }
      const record = asRecord(item)
      if (!record) {
        continue
      }
      const agent = agentFromRecord(record, `agent-${index}`, now)
      index += 1
      if (agent) {
        byId.set(agent.id, { ...byId.get(agent.id), ...agent })
      }
    }
  }
  return Array.from(byId.values())
}

function mergeAgentPreview(
  existing: ClaudeWorkflowAgentSummary | undefined,
  preview: ClaudeWorkflowAgentSummary
): ClaudeWorkflowAgentSummary {
  if (!existing) {
    return preview
  }
  return {
    ...existing,
    ...preview,
    startedAt: Math.min(existing.startedAt, preview.startedAt),
    updatedAt: Math.max(existing.updatedAt, preview.updatedAt),
    lastMessage: preview.lastMessage ?? existing.lastMessage
  }
}

function collectAgentsFromJsonl(records: unknown[], now: number): ClaudeWorkflowAgentSummary[] {
  const byId = new Map<string, ClaudeWorkflowAgentSummary>()
  let index = 0
  for (const item of records) {
    const record = asRecord(item)
    if (!record || byId.size >= MAX_AGENTS) {
      continue
    }
    const nested = asRecord(record.agent) ?? asRecord(record.subagent) ?? record
    const agent = agentFromRecord(nested, `preview-${index}`, now)
    index += 1
    if (!agent) {
      continue
    }
    byId.set(agent.id, mergeAgentPreview(byId.get(agent.id), agent))
  }
  return Array.from(byId.values())
}

function collectPhases(
  root: unknown,
  agents: ClaudeWorkflowAgentSummary[]
): ClaudeWorkflowPhaseSummary[] {
  const arrays: unknown[][] = []
  collectArraysByKey(root, new Set(['phases', 'phaseSummaries']), arrays)
  const phases: ClaudeWorkflowPhaseSummary[] = []
  for (const array of arrays) {
    for (const item of array) {
      const record = asRecord(item)
      if (!record) {
        continue
      }
      const id =
        readString(record, ['id', 'phaseId', 'phase_id', 'name']) ?? `phase-${phases.length}`
      const label = readString(record, ['label', 'name', 'title']) ?? id
      const agentIds = agents.filter((agent) => agent.phaseId === id).map((agent) => agent.id)
      phases.push({
        id,
        label,
        state: normalizeClaudeWorkflowState(record.state ?? record.status),
        agentIds
      })
    }
  }
  if (phases.length === 0) {
    const grouped = new Map<string, ClaudeWorkflowAgentSummary[]>()
    for (const agent of agents) {
      if (!agent.phaseId) {
        continue
      }
      const bucket = grouped.get(agent.phaseId)
      if (bucket) {
        bucket.push(agent)
      } else {
        grouped.set(agent.phaseId, [agent])
      }
    }
    for (const [phaseId, phaseAgents] of grouped) {
      phases.push({
        id: phaseId,
        label: phaseId,
        state: rollupClaudeWorkflowState(phaseAgents).state,
        agentIds: phaseAgents.map((agent) => agent.id)
      })
    }
  }
  return phases.slice(0, 12)
}

function chooseRunJson(files: string[], evidence: ClaudeWorkflowEvidence): string | null {
  const jsonFiles = files.filter((file) => file.toLowerCase().endsWith('.json'))
  if (evidence.runId) {
    const byRunId = jsonFiles.find((file) => file.includes(evidence.runId ?? ''))
    if (byRunId) {
      return byRunId
    }
  }
  return jsonFiles.find((file) => /run|workflow/i.test(file)) ?? jsonFiles[0] ?? null
}

function listWorkflowDirectory(directory: string | null): { files: string[]; error?: string } {
  if (!directory) {
    return { files: [], error: 'Workflow directory unavailable' }
  }
  try {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      return { files: [], error: 'Workflow directory not found yet' }
    }
    return { files: readdirSync(directory) }
  } catch (err) {
    return { files: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function buildSummary(args: {
  previous?: ClaudeWorkflowRunSummary
  id: string
  input: NonNullable<ReturnType<typeof extractClaudeWorkflowDetectorInput>>
  connectionId: string | null
  directory: string | null
}): ClaudeWorkflowRunSummary {
  const now = Date.now()
  const { files, error: listError } = listWorkflowDirectory(args.directory)
  const jsonFile = chooseRunJson(files, args.input.evidence)
  const jsonResult = jsonFile
    ? safeReadJsonFile(path.join(args.directory ?? '', jsonFile))
    : { value: null }
  const jsonAgents = collectAgentsFromJson(jsonResult.value, now)
  const jsonlRecords: unknown[] = []
  let jsonlError: string | undefined
  for (const file of files
    .filter((entry) => entry.toLowerCase().endsWith('.jsonl'))
    .slice(0, MAX_AGENTS)) {
    const result = readJsonlTail(path.join(args.directory ?? '', file))
    jsonlRecords.push(...result.records)
    jsonlError ??= result.error
  }
  const previewAgents = collectAgentsFromJsonl(jsonlRecords, now)
  const byId = new Map<string, ClaudeWorkflowAgentSummary>()
  for (const agent of jsonAgents) {
    byId.set(agent.id, agent)
  }
  for (const agent of previewAgents) {
    byId.set(agent.id, mergeAgentPreview(byId.get(agent.id), agent))
  }
  const agents = Array.from(byId.values())
  const phases = collectPhases(jsonResult.value, agents)
  const rollup = rollupClaudeWorkflowState(agents)
  const state: ClaudeWorkflowState =
    agents.length === 0 && (listError || jsonResult.error || jsonlError) ? 'error' : rollup.state
  const scriptName = basenameFromLocalPath(args.input.evidence.scriptPath)
  const label =
    args.input.evidence.label ??
    readString(asRecord(jsonResult.value) ?? {}, ['title', 'label', 'name']) ??
    scriptName ??
    'Claude workflow'
  const lastMessage = agents
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find((agent) => agent.lastMessage)?.lastMessage
  return {
    id: args.id,
    parentPaneKey: args.input.paneKey,
    parentTabId: args.input.tabId ?? parsePaneKey(args.input.paneKey)?.tabId,
    worktreeId: args.input.worktreeId,
    connectionId: args.connectionId,
    runId: args.input.evidence.runId,
    label,
    scriptName,
    state,
    startedAt: args.previous?.startedAt ?? agents[0]?.startedAt ?? now,
    updatedAt: Math.max(now, ...agents.map((agent) => agent.updatedAt)),
    lastMessage: lastMessage ?? listError ?? jsonResult.error ?? jsonlError,
    phaseSummary: phases.map((phase) => phase.label).join(' -> ') || undefined,
    agents,
    phases,
    counts:
      agents.length === 0 && state === 'error' ? { ...rollup.counts, error: 1 } : rollup.counts,
    error: listError ?? jsonResult.error ?? jsonlError
  }
}

export class ClaudeWorkflowIndex {
  private runsById = new Map<string, LocalRunRecord>()
  private dismissedIdentities = new Set<string>()
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private updateListener: UpdateListener | null = null

  setUpdateListener(listener: UpdateListener | null): void {
    this.updateListener = listener
  }

  processRawHookBody({ body, connectionId }: RawHookProcessArgs): void {
    if (connectionId !== null) {
      return
    }
    const input = extractClaudeWorkflowDetectorInput(body)
    if (!input) {
      return
    }
    const identity = workflowIdentity({
      connectionId,
      paneKey: input.paneKey,
      scriptPath: input.evidence.scriptPath,
      runId: input.evidence.runId,
      transcriptDir: input.evidence.transcriptDir
    })
    if (this.dismissedIdentities.has(identity)) {
      return
    }
    const id = `claude-workflow:${hashWorkflowIdentity(identity)}`
    const directory = resolveWorkflowDirectory(input.evidence)
    const existing = this.runsById.get(id)
    if (this.pendingTimers.has(id)) {
      clearTimeout(this.pendingTimers.get(id))
    }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(id)
      const summary = buildSummary({
        previous: existing?.summary,
        id,
        input,
        connectionId,
        directory
      })
      this.runsById.set(id, {
        summary,
        evidence: input.evidence,
        directory,
        suppressedIdentity: identity
      })
      this.emitUpdate()
    }, WORKFLOW_READ_DEBOUNCE_MS)
    this.pendingTimers.set(id, timer)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  getSnapshot(): ClaudeWorkflowSnapshot {
    return { runs: Array.from(this.runsById.values(), (run) => run.summary), updatedAt: Date.now() }
  }

  dropRun(id: string): void {
    const existing = this.runsById.get(id)
    if (existing) {
      this.dismissedIdentities.add(existing.suppressedIdentity)
      this.runsById.delete(id)
      this.emitUpdate()
      return
    }
    if (id.startsWith('claude-workflow:')) {
      this.dismissedIdentities.add(id)
    }
  }

  dropRunsByWorktree(worktreeId: string): void {
    let changed = false
    for (const [id, run] of this.runsById) {
      if (run.summary.worktreeId !== worktreeId) {
        continue
      }
      this.dismissedIdentities.add(run.suppressedIdentity)
      this.runsById.delete(id)
      changed = true
    }
    if (changed) {
      this.emitUpdate()
    }
  }

  private emitUpdate(): void {
    this.updateListener?.(this.getSnapshot())
  }
}

export const claudeWorkflowIndex = new ClaudeWorkflowIndex()
