import { isTuiAgent } from '../../../shared/tui-agent-config'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { isWindowsAbsolutePathLike } from '../../../shared/cross-platform-path'
import type { GlobalSettings, Repo, TuiAgent } from '../../../shared/types'

export const SETUP_SCRIPT_GENERATION_WORKSPACE_NAME = 'add-orca-yaml-setup'
export const SETUP_SCRIPT_GENERATION_DISPLAY_NAME = 'Add orca.yaml setup script'

export type SetupScriptGenerationWorkspaceRequest = {
  repoId: string
  name: string
  baseBranch: string | undefined
  setupDecision: 'skip'
  telemetrySource: 'sidebar'
  displayName: string
  createdWithAgent: TuiAgent
}

export type SetupPromptDefaultAgentResolution =
  | { status: 'ready'; agent: TuiAgent }
  | { status: 'unset' }
  | { status: 'disabled'; agent: TuiAgent }
  | { status: 'undetected'; agent: TuiAgent }

export type SetupScriptGenerationUnavailableState =
  | { reason: 'unset' }
  | { reason: 'disabled'; agentLabel: string | null }
  | { reason: 'undetected'; agentLabel: string | null }
  | { reason: 'startup_unavailable'; agentLabel: string | null }

export type SetupScriptGenerationAgentUnavailableState = {
  repoId: string
  reason: 'unset' | 'disabled' | 'undetected' | 'startup_unavailable'
  agent?: TuiAgent
}

export function resolveSetupPromptDefaultAgent(
  settings: Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents'> | null | undefined,
  detectedAgents: Iterable<TuiAgent> | null | undefined
): SetupPromptDefaultAgentResolution {
  const defaultAgent = settings?.defaultTuiAgent
  if (!isTuiAgent(defaultAgent)) {
    return { status: 'unset' }
  }
  if (!isTuiAgentEnabled(defaultAgent, settings?.disabledTuiAgents)) {
    return { status: 'disabled', agent: defaultAgent }
  }
  const detectedSet = detectedAgents instanceof Set ? detectedAgents : new Set(detectedAgents ?? [])
  if (!detectedSet.has(defaultAgent)) {
    return { status: 'undetected', agent: defaultAgent }
  }
  return { status: 'ready', agent: defaultAgent }
}

export function resolveConfiguredSetupPromptDefaultAgent(
  settings: Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents'> | null | undefined
): Exclude<SetupPromptDefaultAgentResolution, { status: 'undetected' }> {
  const defaultAgent = settings?.defaultTuiAgent
  if (!isTuiAgent(defaultAgent)) {
    return { status: 'unset' }
  }
  if (!isTuiAgentEnabled(defaultAgent, settings?.disabledTuiAgents)) {
    return { status: 'disabled', agent: defaultAgent }
  }
  return { status: 'ready', agent: defaultAgent }
}

export function getSetupScriptGenerationAgentUnavailable(
  repoId: string,
  resolution: SetupPromptDefaultAgentResolution
): SetupScriptGenerationAgentUnavailableState | null {
  if (resolution.status === 'ready') {
    return null
  }
  return {
    repoId,
    reason: resolution.status,
    ...('agent' in resolution ? { agent: resolution.agent } : {})
  }
}

export function getSetupScriptGenerationDetectedAgents({
  repo,
  localDetectedAgents,
  remoteDetectedAgentsByConnection
}: {
  repo: Pick<Repo, 'connectionId'>
  localDetectedAgents: TuiAgent[] | null
  remoteDetectedAgentsByConnection: Record<string, TuiAgent[] | null>
}): TuiAgent[] | null {
  const connectionId = repo.connectionId?.trim()
  return connectionId
    ? (remoteDetectedAgentsByConnection[connectionId] ?? null)
    : localDetectedAgents
}

export function canStartSetupScriptGeneration({
  agentResolution,
  isGenerating,
  isImporting
}: {
  agentResolution: SetupPromptDefaultAgentResolution | null
  isGenerating: boolean
  isImporting: boolean
}): boolean {
  return agentResolution?.status === 'ready' && !isGenerating && !isImporting
}

export function buildSetupScriptGenerationWorkspaceRequest({
  repo,
  agent
}: {
  repo: Pick<Repo, 'id' | 'worktreeBaseRef'>
  agent: TuiAgent
}): SetupScriptGenerationWorkspaceRequest {
  return {
    repoId: repo.id,
    name: SETUP_SCRIPT_GENERATION_WORKSPACE_NAME,
    baseBranch: repo.worktreeBaseRef,
    setupDecision: 'skip',
    telemetrySource: 'sidebar',
    displayName: SETUP_SCRIPT_GENERATION_DISPLAY_NAME,
    createdWithAgent: agent
  }
}

export function getSetupScriptGenerationStartupPlatform(
  repo: Pick<Repo, 'connectionId' | 'path'>,
  clientPlatform: NodeJS.Platform
): NodeJS.Platform {
  // Why: SSH agent commands execute in the remote relay shell. Today supported
  // SSH targets may still be Windows; infer that from the remote repo path.
  if (!repo.connectionId?.trim()) {
    return clientPlatform
  }
  return isWindowsAbsolutePathLike(repo.path) ? 'win32' : 'linux'
}

export function getSetupScriptGenerationUnavailableCopy(
  state: SetupScriptGenerationUnavailableState | null
): string | null {
  if (!state) {
    return null
  }
  if (state.reason === 'disabled') {
    return `${state.agentLabel ?? 'Your default agent'} is disabled. Enable it or choose another default agent in Settings.`
  }
  if (state.reason === 'undetected') {
    return `${state.agentLabel ?? 'Your default agent'} was not detected for this repo. Refresh detection or choose another default agent in Settings.`
  }
  if (state.reason === 'startup_unavailable') {
    return `Orca could not build a launch command for ${state.agentLabel ?? 'your default agent'}. Check the agent command in Settings.`
  }
  return 'Choose a default agent in Settings before generating a setup workspace.'
}

export function buildSetupScriptGenerationPrompt(repo: Pick<Repo, 'displayName'>): string {
  return [
    `Inspect the ${repo.displayName} repository and add or update only orca.yaml.`,
    '',
    'Goal:',
    '- Add a minimal repo-specific `scripts.setup` command so new Orca workspaces start ready.',
    '- Prefer the existing package manager and lockfile conventions. For example, pnpm repos usually use `pnpm install`.',
    '',
    'Constraints:',
    '- Do not change files other than orca.yaml.',
    '- Do not run destructive commands, delete data, or rewrite history.',
    '- Do not read, print, or add secrets.',
    '- Do not commit, push, open a PR, or change remotes.',
    '- Keep the setup command cross-platform and SSH-safe when practical.',
    '- Keep the setup minimal; avoid build, test, database, or service-start commands unless the repo clearly requires them to prepare dependencies.',
    '',
    'When done, summarize the orca.yaml change and any assumptions.'
  ].join('\n')
}
