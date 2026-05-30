import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  ClaudeWorkflowRunSummary,
  ClaudeWorkflowSnapshot
} from '../../../../shared/claude-workflow-status'

export type ClaudeWorkflowsSlice = {
  claudeWorkflowRunsById: Record<string, ClaudeWorkflowRunSummary>
  claudeWorkflowEpoch: number
  setClaudeWorkflowSnapshot: (snapshot: ClaudeWorkflowSnapshot) => void
  dismissClaudeWorkflowRun: (id: string) => void
  dismissClaudeWorkflowRunsByWorktree: (worktreeId: string) => void
  pruneClaudeWorkflowRuns: (validWorktreeIds: Set<string>) => void
}

function snapshotToMap(snapshot: ClaudeWorkflowSnapshot): Record<string, ClaudeWorkflowRunSummary> {
  const next: Record<string, ClaudeWorkflowRunSummary> = {}
  for (const run of snapshot.runs) {
    next[run.id] = run
  }
  return next
}

export const createClaudeWorkflowsSlice: StateCreator<AppState, [], [], ClaudeWorkflowsSlice> = (
  set
) => ({
  claudeWorkflowRunsById: {},
  claudeWorkflowEpoch: 0,

  setClaudeWorkflowSnapshot: (snapshot) => {
    set((s) => {
      const next = snapshotToMap(snapshot)
      const currentKeys = Object.keys(s.claudeWorkflowRunsById)
      const nextKeys = Object.keys(next)
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => s.claudeWorkflowRunsById[key] === next[key])
      ) {
        return s
      }
      return {
        claudeWorkflowRunsById: next,
        claudeWorkflowEpoch: s.claudeWorkflowEpoch + 1
      }
    })
  },

  dismissClaudeWorkflowRun: (id) => {
    set((s) => {
      if (!(id in s.claudeWorkflowRunsById)) {
        return s
      }
      const next = { ...s.claudeWorkflowRunsById }
      delete next[id]
      return {
        claudeWorkflowRunsById: next,
        claudeWorkflowEpoch: s.claudeWorkflowEpoch + 1
      }
    })
    if (typeof window !== 'undefined') {
      window.api?.claudeWorkflows?.drop?.(id)
    }
  },

  dismissClaudeWorkflowRunsByWorktree: (worktreeId) => {
    let changed = false
    set((s) => {
      const next: Record<string, ClaudeWorkflowRunSummary> = {}
      for (const [id, run] of Object.entries(s.claudeWorkflowRunsById)) {
        if (run.worktreeId === worktreeId) {
          changed = true
          continue
        }
        next[id] = run
      }
      if (!changed) {
        return s
      }
      return {
        claudeWorkflowRunsById: next,
        claudeWorkflowEpoch: s.claudeWorkflowEpoch + 1
      }
    })
    if (changed && typeof window !== 'undefined') {
      window.api?.claudeWorkflows?.dropByWorktree?.(worktreeId)
    }
  },

  pruneClaudeWorkflowRuns: (validWorktreeIds) => {
    set((s) => {
      let changed = false
      const next: Record<string, ClaudeWorkflowRunSummary> = {}
      for (const [id, run] of Object.entries(s.claudeWorkflowRunsById)) {
        if (run.worktreeId && !validWorktreeIds.has(run.worktreeId)) {
          changed = true
          continue
        }
        next[id] = run
      }
      return changed
        ? { claudeWorkflowRunsById: next, claudeWorkflowEpoch: s.claudeWorkflowEpoch + 1 }
        : s
    })
  }
})
