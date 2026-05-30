import type { AgentStatusState } from './agent-status-types'

export type ClaudeWorkflowState = AgentStatusState | 'error'

export type ClaudeWorkflowAgentSummary = {
  id: string
  label: string
  state: ClaudeWorkflowState
  startedAt: number
  updatedAt: number
  lastMessage?: string
  tokenCount?: number
  phaseId?: string
}

export type ClaudeWorkflowPhaseSummary = {
  id: string
  label: string
  state: ClaudeWorkflowState
  agentIds: string[]
}

export type ClaudeWorkflowRunSummary = {
  id: string
  parentPaneKey: string
  parentTabId?: string
  worktreeId?: string
  connectionId: string | null
  runId?: string
  label: string
  scriptName?: string
  state: ClaudeWorkflowState
  startedAt: number
  updatedAt: number
  lastMessage?: string
  phaseSummary?: string
  agents: ClaudeWorkflowAgentSummary[]
  phases: ClaudeWorkflowPhaseSummary[]
  counts: {
    total: number
    done: number
    working: number
    waiting: number
    blocked: number
    error: number
  }
  error?: string
}

export type ClaudeWorkflowSnapshot = {
  runs: ClaudeWorkflowRunSummary[]
  updatedAt: number
}

export type ClaudeWorkflowEvidence = {
  scriptPath?: string
  runId?: string
  transcriptDir?: string
  label?: string
}

export type ClaudeWorkflowDetectorInput = {
  paneKey: string
  tabId?: string
  worktreeId?: string
  evidence: ClaudeWorkflowEvidence
}

const MAX_STRING_FIELD = 240
const MAX_MESSAGE_FIELD = 500
const WORKFLOW_TOOL_NAME = 'workflow'

function normalizeSingleLine(value: unknown, maxLength = MAX_STRING_FIELD): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().replace(/[\r\n\u2028\u2029]+/g, ' ')
  if (!normalized) {
    return undefined
  }
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function parseEmbeddedJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function getHookPayload(body: Record<string, unknown>): unknown {
  const rawPayload = body.payload
  if (typeof rawPayload === 'string') {
    return parseEmbeddedJson(rawPayload)
  }
  return rawPayload
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeSingleLine(record[key])
    if (value) {
      return value
    }
  }
  return undefined
}

function visitObjects(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
  depth = 0,
  seen = new Set<unknown>()
): void {
  if (depth > 6 || typeof value !== 'object' || value === null || seen.has(value)) {
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      visitObjects(item, visitor, depth + 1, seen)
    }
    return
  }
  const record = value as Record<string, unknown>
  visitor(record)
  for (const child of Object.values(record)) {
    visitObjects(
      typeof child === 'string' ? parseEmbeddedJson(child) : child,
      visitor,
      depth + 1,
      seen
    )
  }
}

function isWorkflowToolRecord(record: Record<string, unknown>): boolean {
  const toolName = readFirstString(record, [
    'tool_name',
    'toolName',
    'name',
    'tool',
    'functionName'
  ])
  return toolName?.toLowerCase() === WORKFLOW_TOOL_NAME
}

function collectWorkflowEvidence(root: unknown): ClaudeWorkflowEvidence | null {
  let sawWorkflowTool = false
  const evidence: ClaudeWorkflowEvidence = {}
  visitObjects(root, (record) => {
    if (isWorkflowToolRecord(record)) {
      sawWorkflowTool = true
    }
    evidence.scriptPath ??= readFirstString(record, [
      'scriptPath',
      'script_path',
      'workflowScriptPath',
      'workflow_script_path'
    ])
    evidence.runId ??= readFirstString(record, ['runId', 'run_id', 'workflowRunId'])
    evidence.transcriptDir ??= readFirstString(record, [
      'transcriptDir',
      'transcript_dir',
      'transcriptsDir',
      'workflowDir',
      'workflow_dir'
    ])
    evidence.label ??= normalizeSingleLine(
      record.title ?? record.label ?? record.workflowName ?? record.workflow_name
    )
  })
  if (!sawWorkflowTool) {
    return null
  }
  if (!evidence.scriptPath && !evidence.runId && !evidence.transcriptDir) {
    return null
  }
  return evidence
}

export function extractClaudeWorkflowDetectorInput(
  body: unknown
): ClaudeWorkflowDetectorInput | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const record = body as Record<string, unknown>
  const paneKey = normalizeSingleLine(record.paneKey)
  if (!paneKey) {
    return null
  }
  const payload = getHookPayload(record)
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const evidence = collectWorkflowEvidence(payload)
  if (!evidence) {
    return null
  }
  return {
    paneKey,
    tabId: normalizeSingleLine(record.tabId),
    worktreeId: normalizeSingleLine(record.worktreeId),
    evidence
  }
}

export function normalizeClaudeWorkflowState(value: unknown): ClaudeWorkflowState {
  const normalized = normalizeSingleLine(value, 80)?.toLowerCase()
  switch (normalized) {
    case 'working':
    case 'running':
    case 'active':
    case 'in_progress':
    case 'in-progress':
      return 'working'
    case 'blocked':
    case 'error':
    case 'failed':
    case 'failure':
      return normalized === 'blocked' ? 'blocked' : 'error'
    case 'waiting':
    case 'queued':
    case 'pending':
      return 'waiting'
    case 'done':
    case 'complete':
    case 'completed':
    case 'success':
    case 'succeeded':
      return 'done'
    default:
      return 'working'
  }
}

export function rollupClaudeWorkflowState(agents: readonly ClaudeWorkflowAgentSummary[]): {
  state: ClaudeWorkflowState
  counts: ClaudeWorkflowRunSummary['counts']
} {
  const counts = { total: agents.length, done: 0, working: 0, waiting: 0, blocked: 0, error: 0 }
  for (const agent of agents) {
    counts[agent.state] += 1
  }
  const state: ClaudeWorkflowState =
    counts.error > 0
      ? 'error'
      : counts.blocked > 0
        ? 'blocked'
        : counts.working > 0
          ? 'working'
          : counts.waiting > 0
            ? 'waiting'
            : 'done'
  return { state, counts }
}

export function trimClaudeWorkflowMessage(value: unknown): string | undefined {
  return normalizeSingleLine(value, MAX_MESSAGE_FIELD)
}
