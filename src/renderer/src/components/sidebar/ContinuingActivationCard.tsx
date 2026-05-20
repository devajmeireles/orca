import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowRight, CheckCircle2, CircleAlert, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  getTopContinuingActivationCandidate,
  type ContinuingActivationCandidate
} from '@/lib/continuing-activation-candidates'
import {
  createContinuingActivationShownRecorder,
  trackContinuingActivationCandidate
} from '@/lib/continuing-activation-telemetry'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { cn } from '@/lib/utils'

const SURFACE = 'sidebar_next_action' as const

const CANDIDATE_COPY = {
  agent_needs_input: {
    eyebrow: 'Next action',
    title: 'Respond to agent',
    detail: 'An agent is waiting for input.',
    cta: 'Open',
    icon: CircleAlert
  },
  agent_ready_for_review: {
    eyebrow: 'Next action',
    title: 'Review agent output',
    detail: 'New agent output is ready.',
    cta: 'Review',
    icon: CheckCircle2
  }
} as const

function ContinuingActivationCard(): React.JSX.Element | null {
  const candidateState = useAppStore(
    useShallow((s) => ({
      activeView: s.activeView,
      activeWorktreeId: s.activeWorktreeId,
      activeTabId: s.activeTabId,
      worktreesByRepo: s.worktreesByRepo,
      tabsByWorktree: s.tabsByWorktree,
      runtimePaneTitlesByTabId: s.runtimePaneTitlesByTabId,
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
      continuingActivationCues: s.continuingActivationCues,
      acknowledgedAgentsByPaneKey: s.acknowledgedAgentsByPaneKey,
      dismissedContinuingActivationCandidateIds: s.dismissedContinuingActivationCandidateIds,
      agentStatusEpoch: s.agentStatusEpoch
    }))
  )
  const dismissContinuingActivationCandidate = useAppStore(
    (s) => s.dismissContinuingActivationCandidate
  )
  const dismissContinuingActivationCue = useAppStore((s) => s.dismissContinuingActivationCue)
  const clearContinuingActivationCue = useAppStore((s) => s.clearContinuingActivationCue)
  const acknowledgeAgents = useAppStore((s) => s.acknowledgeAgents)

  const candidate = useMemo(
    () => getTopContinuingActivationCandidate(candidateState, Date.now()),
    // agentStatusEpoch is read only to force freshness-boundary recomputes.
    [candidateState]
  )
  const shownRecorderRef = useRef(createContinuingActivationShownRecorder())

  useEffect(() => {
    if (candidate) {
      shownRecorderRef.current(candidate, SURFACE)
    }
  }, [candidate])

  const openCandidate = useCallback(
    (target: ContinuingActivationCandidate): void => {
      trackContinuingActivationCandidate('continuing_activation_candidate_clicked', target, SURFACE)
      const result = activateAndRevealWorktree(target.worktreeId)
      if (!result) {
        return
      }
      const state = useAppStore.getState()
      if (target.tabId) {
        const tabs = state.tabsByWorktree[target.worktreeId] ?? []
        if (tabs.some((tab) => tab.id === target.tabId)) {
          state.setActiveTab(target.tabId)
        }
      }
      if (target.paneKey) {
        acknowledgeAgents([target.paneKey])
      }
      if (target.cueId) {
        clearContinuingActivationCue(target.cueId)
      }
      trackContinuingActivationCandidate('continuing_activation_candidate_landed', target, SURFACE)
    },
    [acknowledgeAgents, clearContinuingActivationCue]
  )

  const worktree = candidate
    ? findWorktreeById(candidateState.worktreesByRepo, candidate.worktreeId)
    : undefined
  if (!candidate || !worktree) {
    return null
  }

  const copy = CANDIDATE_COPY[candidate.kind]
  const Icon = copy.icon

  const handleDismiss = (event: React.MouseEvent): void => {
    event.stopPropagation()
    if (candidate.cueId) {
      dismissContinuingActivationCue(candidate.cueId)
    } else {
      dismissContinuingActivationCandidate(candidate.id)
    }
    trackContinuingActivationCandidate(
      'continuing_activation_candidate_dismissed',
      candidate,
      SURFACE
    )
  }

  const handleOpen = (): void => {
    openCandidate(candidate)
  }

  return (
    <div className="px-2 pb-2">
      <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/35 p-2 shadow-sm">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              candidate.kind === 'agent_needs_input' ? 'text-red-500' : 'text-emerald-500'
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              {copy.eyebrow}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss next action"
            className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent/70"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-sidebar-foreground">
              {copy.title}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {worktree.displayName ? `${copy.detail} ${worktree.displayName}` : copy.detail}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {copy.cta}
            <ArrowRight className="size-3" aria-hidden />
          </span>
        </button>
      </div>
    </div>
  )
}

export default React.memo(ContinuingActivationCard)
