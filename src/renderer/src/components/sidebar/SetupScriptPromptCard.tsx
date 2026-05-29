import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, LoaderCircle, RefreshCw, Settings, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { getRepositoryLocalCommandsSectionId } from '@/components/settings/repository-settings-targets'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import SetupScriptGenerationAction from './SetupScriptGenerationAction'
import {
  buildImportedHookSettings,
  formatCandidateSource,
  isSetupScriptPromptDismissed,
  ignoresSharedSetupScripts,
  inspectSetupScriptPromptState,
  type SetupScriptPromptInspection
} from '@/lib/setup-script-prompt'
import { checkRuntimeHooks, inspectRuntimeSetupScriptImports } from '@/runtime/runtime-hooks-client'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import {
  buildSetupScriptPromptActionTelemetry,
  buildSetupScriptPromptTelemetry
} from '../../../../shared/setup-script-telemetry'

type PromptState = SetupScriptPromptInspection

function SetupScriptPromptCard(): React.JSX.Element | null {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const settings = useAppStore((s) => s.settings)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)
  const dismissedRepoIds = useAppStore((s) => s.setupScriptPromptDismissedRepoIds)
  const dismissSetupScriptPrompt = useAppStore((s) => s.dismissSetupScriptPrompt)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [inspectionRetryKey, setInspectionRetryKey] = useState(0)
  const trackedPromptKeysRef = useRef<Set<string>>(new Set())

  const activeRepo = useMemo(
    () => repos.find((repo) => repo.id === activeRepoId) ?? null,
    [activeRepoId, repos]
  )
  const isDismissed = activeRepo
    ? isSetupScriptPromptDismissed(activeRepo.id, dismissedRepoIds)
    : false

  useEffect(() => {
    if (!sidebarOpen || !activeRepo || !isGitRepoKind(activeRepo) || isDismissed) {
      setPromptState(null)
      return
    }

    const repo = activeRepo
    let cancelled = false
    setPromptState(null)

    async function inspectRepoSetup(): Promise<void> {
      const nextState = await inspectSetupScriptPromptState({
        repo,
        checkHooks: () => checkRuntimeHooks(settings, repo.id),
        inspectImports: () => inspectRuntimeSetupScriptImports(settings, repo.id)
      })
      if (!cancelled) {
        setPromptState(nextState)
      }
    }

    void inspectRepoSetup()

    return () => {
      cancelled = true
    }
  }, [activeRepo, inspectionRetryKey, isDismissed, settings, sidebarOpen])

  const openLocalCommandSettings = useCallback(
    (repoId: string) => {
      // Why: imported setup commands are local repo settings; a stale Settings
      // search should not hide the exact editor this action opens.
      setSettingsSearchQuery('')
      openSettingsTarget({
        pane: 'repo',
        repoId,
        sectionId: getRepositoryLocalCommandsSectionId(repoId)
      })
      openSettingsPage()
    },
    [openSettingsPage, openSettingsTarget, setSettingsSearchQuery]
  )

  const handleRetryInspection = useCallback(() => {
    setInspectionRetryKey((value) => value + 1)
  }, [])

  useEffect(() => {
    if (
      !sidebarOpen ||
      !activeRepo ||
      !isGitRepoKind(activeRepo) ||
      isDismissed ||
      promptState?.repoId !== activeRepo.id ||
      promptState.status !== 'ok' ||
      promptState.hasEffectiveSetup
    ) {
      return
    }

    const telemetry = buildSetupScriptPromptTelemetry({
      candidate: promptState.candidate,
      hasSharedHooks: promptState.hasSharedHooks
    })
    // Why: React may re-render the sidebar often; this event should represent
    // a distinct prompt exposure for this repo/source, not render churn.
    const promptKey = [
      activeRepo.id,
      telemetry.mode,
      telemetry.provider ?? 'none',
      telemetry.file_count_bucket,
      telemetry.unsupported_field_count_bucket,
      String(telemetry.has_shared_hooks)
    ].join(':')
    if (trackedPromptKeysRef.current.has(promptKey)) {
      return
    }

    trackedPromptKeysRef.current.add(promptKey)
    track('setup_script_prompt_shown', telemetry)
  }, [activeRepo, isDismissed, promptState, sidebarOpen])

  const handleConfigure = useCallback(() => {
    if (!activeRepo) {
      return
    }
    if (
      promptState?.repoId === activeRepo.id &&
      promptState.status === 'ok' &&
      !promptState.hasEffectiveSetup
    ) {
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'configure_clicked',
          candidate: promptState.candidate,
          hasSharedHooks: promptState.hasSharedHooks
        })
      )
    }
    openLocalCommandSettings(activeRepo.id)
  }, [activeRepo, openLocalCommandSettings, promptState])

  const handleDismiss = useCallback(() => {
    if (activeRepo) {
      if (
        promptState?.repoId === activeRepo.id &&
        promptState.status === 'ok' &&
        !promptState.hasEffectiveSetup
      ) {
        track(
          'setup_script_prompt_action',
          buildSetupScriptPromptActionTelemetry({
            action: 'dismissed',
            candidate: promptState.candidate,
            hasSharedHooks: promptState.hasSharedHooks
          })
        )
      }
      dismissSetupScriptPrompt(activeRepo.id)
    }
  }, [activeRepo, dismissSetupScriptPrompt, promptState])

  const handleImport = useCallback(async () => {
    if (!activeRepo || promptState?.status !== 'ok' || !promptState.candidate) {
      return
    }
    setIsImporting(true)
    try {
      const importedRepoId = activeRepo.id
      const nextSettings = buildImportedHookSettings(
        activeRepo,
        promptState.candidate,
        promptState.hasSharedHooks
      )
      const didUpdate = await updateRepo(activeRepo.id, { hookSettings: nextSettings })
      if (!didUpdate) {
        track(
          'setup_script_prompt_action',
          buildSetupScriptPromptActionTelemetry({
            action: 'import_failed',
            candidate: promptState.candidate,
            hasSharedHooks: promptState.hasSharedHooks
          })
        )
        toast.error('Failed to import setup script')
        return
      }
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'import_completed',
          candidate: promptState.candidate,
          hasSharedHooks: promptState.hasSharedHooks
        })
      )
      setPromptState((current) =>
        current?.repoId === activeRepo.id && current.status === 'ok'
          ? { ...current, hasEffectiveSetup: true }
          : current
      )
      const skippedCount = promptState.candidate.unsupportedFields?.length ?? 0
      toast.success('Setup script imported', {
        description:
          skippedCount > 0
            ? `${skippedCount} unsupported field${skippedCount === 1 ? '' : 's'} skipped. Saved to this repo's local settings.`
            : "Saved to this repo's local settings.",
        action: {
          label: 'View in Settings',
          onClick: () => openLocalCommandSettings(importedRepoId)
        }
      })
    } catch (error) {
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'import_failed',
          candidate: promptState.candidate,
          hasSharedHooks: promptState.hasSharedHooks
        })
      )
      console.warn('[setup-script-prompt] Failed to import setup script:', error)
      toast.error('Failed to import setup script')
    } finally {
      setIsImporting(false)
    }
  }, [activeRepo, openLocalCommandSettings, promptState, updateRepo])

  if (
    !sidebarOpen ||
    !activeRepo ||
    !isGitRepoKind(activeRepo) ||
    isDismissed ||
    promptState?.repoId !== activeRepo.id ||
    (promptState.status === 'ok' && promptState.hasEffectiveSetup)
  ) {
    return null
  }

  const isInspectionError = promptState.status === 'error'
  const candidate = promptState.status === 'ok' ? promptState.candidate : null
  const sharedSetupIgnored =
    promptState.status === 'ok' && candidate === null && ignoresSharedSetupScripts(activeRepo)
  const title = 'Setup scripts'
  const candidateSource = candidate ? formatCandidateSource(candidate) : null

  return (
    <div className="px-3 pb-2">
      <div className="rounded-lg border border-sidebar-border bg-sidebar-accent p-3 text-sidebar-accent-foreground shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Dismiss setup scripts"
                className="-mr-1 text-muted-foreground"
                onClick={handleDismiss}
              >
                <X className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              Dismiss
            </TooltipContent>
          </Tooltip>
        </div>

        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {isInspectionError ? (
            <>Couldn&apos;t verify this repo&apos;s setup script right now.</>
          ) : sharedSetupIgnored ? (
            <>
              This repo is set to ignore <code>orca.yaml</code> setup scripts. Configure a local
              setup command or change the script source in Settings.
            </>
          ) : candidateSource ? (
            <>
              Detected setup config from <span className="break-words">{candidateSource}</span>.
              Import it so every workspace starts ready automatically.
            </>
          ) : (
            <>
              A setup script installs dependencies and prepares each new workspace the same way, so
              agents and teammates start from a ready{' '}
              <span className="inline-flex items-center gap-1.5 align-baseline px-1.5 py-0.5 rounded-[4px] bg-accent border border-border dark:bg-accent/50 dark:border-border/60">
                <RepoBadgeMark color={activeRepo.badgeColor} />
                <span className="text-[10px] font-semibold text-foreground truncate max-w-[8rem] leading-none lowercase">
                  {activeRepo.displayName}
                </span>
              </span>
            </>
          )}
        </p>

        {isInspectionError ? (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={handleRetryInspection}
            >
              <RefreshCw className="size-3.5" />
              <span className="truncate">Retry</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleConfigure}
            >
              <Settings className="size-3.5" />
              <span className="sr-only">Settings</span>
            </Button>
          </div>
        ) : sharedSetupIgnored ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-7 w-full text-xs"
            onClick={handleConfigure}
          >
            <Settings className="size-3.5" />
            <span className="truncate">Configure</span>
          </Button>
        ) : candidate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-7 w-full text-xs"
            onClick={() => void handleImport()}
            disabled={isImporting}
          >
            {isImporting ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span className={cn('truncate', isImporting && 'text-muted-foreground')}>
              Import setup
            </span>
          </Button>
        ) : promptState.status === 'ok' ? (
          <SetupScriptGenerationAction
            repo={activeRepo}
            hasSharedHooks={promptState.hasSharedHooks}
            isImporting={isImporting}
          />
        ) : null}
      </div>
    </div>
  )
}

export default React.memo(SetupScriptPromptCard)
