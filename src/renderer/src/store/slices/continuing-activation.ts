import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  ContinuingActivationCue,
  ContinuingActivationCueKind,
  WorkspaceSessionState
} from '../../../../shared/types'

const MAX_CUES = 40
const CUE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

export type ContinuingActivationSlice = {
  continuingActivationCues: Record<string, ContinuingActivationCue>
  dismissedContinuingActivationCandidateIds: Record<string, true>
  hydrateContinuingActivationSession: (session: WorkspaceSessionState) => void
  recordContinuingActivationCue: (cue: {
    kind: ContinuingActivationCueKind
    worktreeId: string
    tabId: string
    createdAt?: number
  }) => void
  dismissContinuingActivationCue: (cueId: string) => void
  dismissContinuingActivationCandidate: (candidateId: string) => void
  clearContinuingActivationCue: (cueId: string) => void
  clearContinuingActivationCuesForTarget: (target: { worktreeId: string; tabId?: string }) => void
}

function buildCueId(kind: ContinuingActivationCueKind, tabId: string): string {
  return `${kind}:${tabId}`
}

function pruneCues(
  cues: Record<string, ContinuingActivationCue>,
  now: number
): Record<string, ContinuingActivationCue> {
  const fresh = Object.values(cues).filter((cue) => now - cue.createdAt <= CUE_RETENTION_MS)
  if (fresh.length <= MAX_CUES) {
    return Object.fromEntries(fresh.map((cue) => [cue.id, cue]))
  }
  return Object.fromEntries(
    fresh
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_CUES)
      .map((cue) => [cue.id, cue])
  )
}

export const createContinuingActivationSlice: StateCreator<
  AppState,
  [],
  [],
  ContinuingActivationSlice
> = (set) => ({
  continuingActivationCues: {},
  dismissedContinuingActivationCandidateIds: {},

  hydrateContinuingActivationSession: (session) => {
    set({
      continuingActivationCues: pruneCues(session.continuingActivationCues ?? {}, Date.now()),
      dismissedContinuingActivationCandidateIds: {}
    })
  },

  recordContinuingActivationCue: ({ kind, worktreeId, tabId, createdAt }) => {
    const now = createdAt ?? Date.now()
    const id = buildCueId(kind, tabId)
    set((s) => ({
      // Why: a fresh completion in the same tab should re-open the cue even
      // if the user dismissed an earlier turn from that tab.
      continuingActivationCues: pruneCues(
        {
          ...s.continuingActivationCues,
          [id]: { id, kind, worktreeId, tabId, createdAt: now }
        },
        now
      )
    }))
  },

  dismissContinuingActivationCue: (cueId) => {
    set((s) => {
      const cue = s.continuingActivationCues[cueId]
      if (!cue || cue.dismissedAt) {
        return s
      }
      return {
        continuingActivationCues: {
          ...s.continuingActivationCues,
          [cueId]: { ...cue, dismissedAt: Date.now() }
        }
      }
    })
  },

  dismissContinuingActivationCandidate: (candidateId) => {
    set((s) =>
      s.dismissedContinuingActivationCandidateIds[candidateId]
        ? s
        : {
            dismissedContinuingActivationCandidateIds: {
              ...s.dismissedContinuingActivationCandidateIds,
              [candidateId]: true
            }
          }
    )
  },

  clearContinuingActivationCue: (cueId) => {
    set((s) => {
      if (!(cueId in s.continuingActivationCues)) {
        return s
      }
      const next = { ...s.continuingActivationCues }
      delete next[cueId]
      return { continuingActivationCues: next }
    })
  },

  clearContinuingActivationCuesForTarget: ({ worktreeId, tabId }) => {
    set((s) => {
      const next = Object.fromEntries(
        Object.entries(s.continuingActivationCues).filter(([, cue]) => {
          if (cue.worktreeId !== worktreeId) {
            return true
          }
          return tabId ? cue.tabId !== tabId : false
        })
      )
      return Object.keys(next).length === Object.keys(s.continuingActivationCues).length
        ? s
        : { continuingActivationCues: next }
    })
  }
})
