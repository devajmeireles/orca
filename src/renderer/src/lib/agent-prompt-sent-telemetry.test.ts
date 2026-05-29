import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTrack = vi.hoisted(() => vi.fn())

vi.mock('@/lib/telemetry', () => ({
  track: mockTrack
}))

import { trackFoldedStartupPromptSent } from './agent-prompt-sent-telemetry'

describe('trackFoldedStartupPromptSent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tracks a folded startup prompt once with bounded telemetry', () => {
    trackFoldedStartupPromptSent({
      prompt: 'fix the spinner',
      startupPlan: {
        followupPrompt: null,
        draftPrompt: null
      },
      startupQueued: true,
      promptTelemetry: {
        agent_kind: 'codex',
        launch_source: 'new_workspace_composer',
        request_kind: 'new'
      }
    })

    expect(mockTrack).toHaveBeenCalledOnce()
    expect(mockTrack).toHaveBeenCalledWith('agent_prompt_sent', {
      agent_kind: 'codex',
      launch_source: 'new_workspace_composer',
      request_kind: 'new'
    })
  })

  it('does not track empty prompts, follow-up prompts, drafts, or bare shells', () => {
    const promptTelemetry = {
      agent_kind: 'codex',
      launch_source: 'new_workspace_composer',
      request_kind: 'new'
    } as const

    trackFoldedStartupPromptSent({
      prompt: '   ',
      startupPlan: { followupPrompt: null, draftPrompt: null },
      startupQueued: true,
      promptTelemetry
    })
    trackFoldedStartupPromptSent({
      prompt: 'fix the spinner',
      startupPlan: { followupPrompt: 'fix the spinner', draftPrompt: null },
      startupQueued: true,
      promptTelemetry
    })
    trackFoldedStartupPromptSent({
      prompt: 'https://example.test/issue/1',
      startupPlan: { followupPrompt: null, draftPrompt: 'https://example.test/issue/1' },
      startupQueued: true,
      promptTelemetry
    })
    trackFoldedStartupPromptSent({
      prompt: 'fix the spinner',
      startupPlan: { followupPrompt: null, draftPrompt: null },
      startupQueued: true,
      promptTelemetry: null
    })
    trackFoldedStartupPromptSent({
      prompt: 'fix the spinner',
      startupPlan: { followupPrompt: null, draftPrompt: null },
      startupQueued: false,
      promptTelemetry
    })

    expect(mockTrack).not.toHaveBeenCalled()
  })
})
