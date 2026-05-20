import { describe, expect, it, vi } from 'vitest'
import {
  createContinuingActivationShownRecorder,
  trackContinuingActivationCandidate,
  type TrackContinuingActivation
} from './continuing-activation-telemetry'
import type { ContinuingActivationCandidate } from './continuing-activation-candidates'

function makeCandidate(
  overrides: Partial<ContinuingActivationCandidate> = {}
): ContinuingActivationCandidate {
  return {
    id: 'agent_needs_input:terminal_title:tab-1:7',
    kind: 'agent_needs_input',
    source: 'terminal_title',
    worktreeId: 'wt-1',
    tabId: 'tab-1',
    paneKey: 'tab-1:7',
    rank: 100,
    updatedAt: 1_000,
    ...overrides
  }
}

describe('continuing activation telemetry', () => {
  it('deduplicates shown events by surface and candidate id', () => {
    const trackFn: TrackContinuingActivation = vi.fn()
    const recordShown = createContinuingActivationShownRecorder(trackFn)
    const candidate = makeCandidate()

    recordShown(candidate, 'sidebar_next_action')
    recordShown(candidate, 'sidebar_next_action')

    expect(trackFn).toHaveBeenCalledTimes(1)
    expect(trackFn).toHaveBeenCalledWith('continuing_activation_candidate_shown', {
      candidate_kind: 'agent_needs_input',
      surface: 'sidebar_next_action'
    })
  })

  it('does not emit candidate ids or target ids in event payloads', () => {
    const trackFn: TrackContinuingActivation = vi.fn()
    const candidate = makeCandidate({
      id: 'agent_ready_for_review:agent_ready_for_review:tab-1:1700000000000',
      kind: 'agent_ready_for_review',
      source: 'agent_completion_cue',
      worktreeId: 'wt-secret',
      tabId: 'tab-secret',
      cueId: 'agent_ready_for_review:tab-secret'
    })

    trackContinuingActivationCandidate(
      'continuing_activation_candidate_clicked',
      candidate,
      'sidebar_next_action',
      trackFn
    )

    expect(trackFn).toHaveBeenCalledWith('continuing_activation_candidate_clicked', {
      candidate_kind: 'agent_ready_for_review',
      surface: 'sidebar_next_action'
    })
    expect(trackFn).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        id: expect.any(String),
        candidate_id: expect.any(String),
        worktree_id: expect.any(String),
        tab_id: expect.any(String)
      })
    )
  })
})
