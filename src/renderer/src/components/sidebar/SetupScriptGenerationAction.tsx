import React, { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, Settings, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree, type AgentStartedTelemetry } from '@/lib/worktree-activation'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { CLIENT_PLATFORM, ensureAgentStartupInTerminal } from '@/lib/new-workspace'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import {
  buildSetupScriptGenerationWorkspaceRequest,
  buildSetupScriptGenerationPrompt,
  canStartSetupScriptGeneration,
  getSetupScriptGenerationAgentUnavailable,
  getSetupScriptGenerationUnavailableCopy,
  getSetupScriptGenerationDetectedAgents,
  getSetupScriptGenerationStartupPlatform,
  resolveConfiguredSetupPromptDefaultAgent,
  resolveSetupPromptDefaultAgent,
  type SetupScriptGenerationAgentUnavailableState,
  type SetupScriptGenerationUnavailableState
} from '@/lib/setup-script-generation'
import { getAgentLabel } from '@/lib/agent-catalog'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type { Repo, TuiAgent } from '../../../../shared/types'
import { buildSetupScriptPromptActionTelemetry } from '../../../../shared/setup-script-telemetry'
import { track } from '@/lib/telemetry'

type SetupScriptGenerationActionProps = {
  repo: Repo
  hasSharedHooks: boolean
  isImporting: boolean
}

function SetupScriptGenerationAction({
  repo,
  hasSharedHooks,
  isImporting
}: SetupScriptGenerationActionProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const createWorktree = useAppStore((s) => s.createWorktree)
  const ensureDetectedAgents = useAppStore((s) => s.ensureDetectedAgents)
  const refreshDetectedAgents = useAppStore((s) => s.refreshDetectedAgents)
  const ensureRemoteDetectedAgents = useAppStore((s) => s.ensureRemoteDetectedAgents)
  const clearRemoteDetectedAgents = useAppStore((s) => s.clearRemoteDetectedAgents)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)
  const detectedAgentIds = useAppStore((s) => s.detectedAgentIds)
  const remoteDetectedAgentIds = useAppStore((s) => s.remoteDetectedAgentIds)
  const isDetectingAgents = useAppStore((s) => s.isDetectingAgents)
  const isRefreshingAgents = useAppStore((s) => s.isRefreshingAgents)
  const isDetectingRemoteAgents = useAppStore((s) => s.isDetectingRemoteAgents)
  const [isGenerating, setIsGenerating] = useState(false)
  const [agentUnavailable, setAgentUnavailable] =
    useState<SetupScriptGenerationAgentUnavailableState | null>(null)

  const repoConnectionId = repo.connectionId?.trim() || null
  const runtimeTarget = getActiveRuntimeTarget(settings)
  const runtimeCreateActive = runtimeTarget.kind !== 'local'
  const detectedAgentsForRepo = getSetupScriptGenerationDetectedAgents({
    repo,
    localDetectedAgents: detectedAgentIds,
    remoteDetectedAgentsByConnection: remoteDetectedAgentIds
  })
  const isDefaultAgentUnset =
    settings?.defaultTuiAgent === null ||
    settings?.defaultTuiAgent === undefined ||
    settings.defaultTuiAgent === 'blank'
  const isCheckingAgent = runtimeCreateActive
    ? false
    : repoConnectionId
      ? (isDetectingRemoteAgents[repoConnectionId] ?? false)
      : isDetectingAgents || isRefreshingAgents
  const agentResolution = runtimeCreateActive
    ? resolveConfiguredSetupPromptDefaultAgent(settings)
    : detectedAgentsForRepo !== null || isDefaultAgentUnset
      ? resolveSetupPromptDefaultAgent(settings, detectedAgentsForRepo)
      : null
  const promptAgentUnavailable =
    agentUnavailable?.repoId === repo.id &&
    (runtimeCreateActive || agentResolution?.status !== 'ready')
      ? agentUnavailable
      : agentResolution?.status === 'ready'
        ? null
        : agentResolution
          ? getSetupScriptGenerationAgentUnavailable(repo.id, agentResolution)
          : null
  const canGenerate =
    !promptAgentUnavailable &&
    canStartSetupScriptGeneration({
      agentResolution,
      isGenerating,
      isImporting
    })
  const unavailableAgentLabel = promptAgentUnavailable?.agent
    ? getAgentLabel(promptAgentUnavailable.agent)
    : null
  const unavailableState: SetupScriptGenerationUnavailableState | null = promptAgentUnavailable
    ? promptAgentUnavailable.reason === 'unset'
      ? { reason: 'unset' }
      : { reason: promptAgentUnavailable.reason, agentLabel: unavailableAgentLabel }
    : null
  const unavailableCopy = getSetupScriptGenerationUnavailableCopy(unavailableState)

  useEffect(() => {
    if (runtimeCreateActive) {
      const resolution = resolveConfiguredSetupPromptDefaultAgent(settings)
      setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, resolution))
      return
    }
    let cancelled = false
    const connectionId = repo.connectionId?.trim()
    const pending = connectionId ? ensureRemoteDetectedAgents(connectionId) : ensureDetectedAgents()
    void pending.then((ids) => {
      if (cancelled) {
        return
      }
      const resolution = resolveSetupPromptDefaultAgent(settings, ids)
      if (resolution.status !== 'ready') {
        setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, resolution))
        return
      }
      setAgentUnavailable(null)
    })
    return () => {
      cancelled = true
    }
  }, [ensureDetectedAgents, ensureRemoteDetectedAgents, repo, runtimeCreateActive, settings])

  const openAgentSettings = useCallback(() => {
    setSettingsSearchQuery('')
    openSettingsTarget({ pane: 'agents', repoId: null })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget, setSettingsSearchQuery])

  const handleRetryAgents = useCallback(async () => {
    setAgentUnavailable(null)
    const connectionId = repo.connectionId?.trim()
    if (runtimeCreateActive) {
      const resolution = resolveConfiguredSetupPromptDefaultAgent(settings)
      setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, resolution))
      return
    }
    if (connectionId) {
      clearRemoteDetectedAgents(connectionId)
      const ids = await ensureRemoteDetectedAgents(connectionId)
      const resolution = resolveSetupPromptDefaultAgent(settings, ids)
      if (resolution.status !== 'ready') {
        setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, resolution))
        return
      }
      setAgentUnavailable(null)
      return
    }
    const ids = await refreshDetectedAgents()
    const resolution = resolveSetupPromptDefaultAgent(settings, ids)
    if (resolution.status !== 'ready') {
      setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, resolution))
      return
    }
    setAgentUnavailable(null)
  }, [
    clearRemoteDetectedAgents,
    ensureRemoteDetectedAgents,
    refreshDetectedAgents,
    repo,
    runtimeCreateActive,
    settings
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) {
      return
    }
    track(
      'setup_script_prompt_action',
      buildSetupScriptPromptActionTelemetry({
        action: 'generate_setup_clicked',
        candidate: null,
        hasSharedHooks
      })
    )

    setIsGenerating(true)
    setAgentUnavailable(null)
    let selectedAgent: TuiAgent | null = null
    try {
      const connectionId = repo.connectionId?.trim()
      const defaultAgent = runtimeCreateActive
        ? resolveConfiguredSetupPromptDefaultAgent(settings)
        : resolveSetupPromptDefaultAgent(
            settings,
            connectionId
              ? await ensureRemoteDetectedAgents(connectionId)
              : await ensureDetectedAgents()
          )
      if (defaultAgent.status !== 'ready') {
        setAgentUnavailable(getSetupScriptGenerationAgentUnavailable(repo.id, defaultAgent))
        trackGenerationFailed(hasSharedHooks)
        return
      }
      selectedAgent = defaultAgent.agent

      const startupPrompt = buildSetupScriptGenerationPrompt(repo)
      const startupPlan = runtimeCreateActive
        ? null
        : buildAgentStartupPlan({
            agent: defaultAgent.agent,
            prompt: startupPrompt,
            cmdOverrides: settings?.agentCmdOverrides ?? {},
            platform: getSetupScriptGenerationStartupPlatform(repo, CLIENT_PLATFORM)
          })
      if (!runtimeCreateActive && !startupPlan) {
        setAgentUnavailable({
          repoId: repo.id,
          reason: 'startup_unavailable',
          agent: defaultAgent.agent
        })
        trackGenerationFailed(hasSharedHooks)
        return
      }

      const createRequest = buildSetupScriptGenerationWorkspaceRequest({
        repo,
        agent: defaultAgent.agent
      })
      const result = await createWorktree(
        createRequest.repoId,
        createRequest.name,
        createRequest.baseBranch,
        createRequest.setupDecision,
        undefined,
        createRequest.telemetrySource,
        createRequest.displayName,
        undefined,
        undefined,
        undefined,
        createRequest.createdWithAgent,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        startupPlan
          ? {
              command: startupPlan.launchCommand,
              ...(startupPlan.env ? { env: startupPlan.env } : {})
            }
          : undefined,
        runtimeCreateActive ? startupPrompt : undefined
      )
      const telemetry: AgentStartedTelemetry = {
        agent_kind: tuiAgentToAgentKind(defaultAgent.agent),
        launch_source: 'sidebar',
        request_kind: 'new'
      }
      activateAndRevealWorktree(result.worktree.id, {
        sidebarRevealBehavior: 'auto',
        ...(startupPlan
          ? {
              startup: {
                command: startupPlan.launchCommand,
                ...(startupPlan.env ? { env: startupPlan.env } : {}),
                ...(defaultAgent.agent === 'command-code'
                  ? {
                      initialAgentStatus: {
                        agent: defaultAgent.agent,
                        prompt: startupPrompt
                      }
                    }
                  : {}),
                telemetry
              }
            }
          : {})
      })
      if (startupPlan) {
        void ensureAgentStartupInTerminal({
          worktreeId: result.worktree.id,
          startup: startupPlan
        })
      }
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'generate_setup_completed',
          candidate: null,
          hasSharedHooks
        })
      )
    } catch (error) {
      trackGenerationFailed(hasSharedHooks)
      console.warn('[setup-script-prompt] Failed to generate setup script workspace:', error)
      if (selectedAgent && isRuntimeStartupAgentUndetectedError(error)) {
        setAgentUnavailable({
          repoId: repo.id,
          reason: 'undetected',
          agent: selectedAgent
        })
      }
      toast.error('Failed to create setup workspace')
    } finally {
      setIsGenerating(false)
    }
  }, [
    createWorktree,
    ensureDetectedAgents,
    ensureRemoteDetectedAgents,
    hasSharedHooks,
    isGenerating,
    repo,
    runtimeCreateActive,
    settings
  ])

  return (
    <>
      {unavailableCopy ? (
        <div className="mt-2 rounded-md border border-sidebar-border bg-sidebar p-2 text-[11px] leading-snug text-muted-foreground">
          {unavailableCopy}
        </div>
      ) : null}
      {detectedAgentsForRepo === null && isCheckingAgent ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Checking your default agent...
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-7 w-full text-xs"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
      >
        {isGenerating ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <WandSparkles className="size-3.5" />
        )}
        <span className={cn('truncate', isGenerating && 'text-muted-foreground')}>
          {isGenerating ? 'Generating setup...' : 'Generate setup'}
        </span>
      </Button>
      {promptAgentUnavailable ? (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={openAgentSettings}
          >
            <Settings className="size-3.5" />
            <span className="truncate">Settings</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => void handleRetryAgents()}
            disabled={isCheckingAgent}
          >
            {isCheckingAgent ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="truncate">Retry</span>
          </Button>
        </div>
      ) : null}
    </>
  )
}

function trackGenerationFailed(hasSharedHooks: boolean): void {
  track(
    'setup_script_prompt_action',
    buildSetupScriptPromptActionTelemetry({
      action: 'generate_setup_failed',
      candidate: null,
      hasSharedHooks
    })
  )
}

function isRuntimeStartupAgentUndetectedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Could not build a startup command for the selected agent')
  )
}

export default React.memo(SetupScriptGenerationAction)
