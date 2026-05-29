import { track } from '@/lib/telemetry'
import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import type { EventProps } from '../../../shared/telemetry-events'

export function trackFoldedStartupPromptSent(args: {
  prompt: string
  startupPlan: Pick<AgentStartupPlan, 'followupPrompt' | 'draftPrompt'>
  promptTelemetry: EventProps<'agent_prompt_sent'> | null
  startupQueued: boolean
}): void {
  const { prompt, startupPlan, promptTelemetry, startupQueued } = args
  if (!startupQueued) {
    return
  }
  if (!promptTelemetry) {
    return
  }
  if (prompt.trim().length === 0) {
    return
  }
  if (startupPlan.followupPrompt !== null || startupPlan.draftPrompt) {
    return
  }
  track('agent_prompt_sent', promptTelemetry)
}
