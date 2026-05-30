import { describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { ClaudeWorkflowRunSummary } from '../../../../shared/claude-workflow-status'

function makeRun(id: string, worktreeId = 'wt-1'): ClaudeWorkflowRunSummary {
  return {
    id,
    parentPaneKey: 'tab-1:550e8400-e29b-41d4-a716-446655440000',
    parentTabId: 'tab-1',
    worktreeId,
    connectionId: null,
    runId: 'run-1',
    label: 'Review workflow',
    state: 'working',
    startedAt: 1,
    updatedAt: 2,
    agents: [],
    phases: [],
    counts: {
      total: 0,
      done: 0,
      working: 0,
      waiting: 0,
      blocked: 0,
      error: 0
    }
  }
}

describe('Claude workflow store slice', () => {
  it('stores snapshots and dismisses through main so snapshots do not resurrect dropped runs', () => {
    const drop = vi.fn()
    vi.stubGlobal('window', { api: { claudeWorkflows: { drop } } })
    const store = createTestStore()

    store
      .getState()
      .setClaudeWorkflowSnapshot({ runs: [makeRun('claude-workflow:1')], updatedAt: 2 })
    expect(Object.keys(store.getState().claudeWorkflowRunsById)).toEqual(['claude-workflow:1'])

    store.getState().dismissClaudeWorkflowRun('claude-workflow:1')

    expect(store.getState().claudeWorkflowRunsById).toEqual({})
    expect(drop).toHaveBeenCalledWith('claude-workflow:1')
    vi.unstubAllGlobals()
  })

  it('dismisses all workflow runs for a worktree', () => {
    const dropByWorktree = vi.fn()
    vi.stubGlobal('window', { api: { claudeWorkflows: { dropByWorktree } } })
    const store = createTestStore()
    store.getState().setClaudeWorkflowSnapshot({
      runs: [makeRun('claude-workflow:1', 'wt-1'), makeRun('claude-workflow:2', 'wt-2')],
      updatedAt: 2
    })

    store.getState().dismissClaudeWorkflowRunsByWorktree('wt-1')

    expect(Object.keys(store.getState().claudeWorkflowRunsById)).toEqual(['claude-workflow:2'])
    expect(dropByWorktree).toHaveBeenCalledWith('wt-1')
    vi.unstubAllGlobals()
  })
})
