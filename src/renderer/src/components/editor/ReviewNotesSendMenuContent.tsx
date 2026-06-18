import React, { useCallback, useMemo } from 'react'
import { SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { QuickLaunchAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import {
  activeAgentNotesSendFailureMessage,
  sendNotesToActiveAgentSession,
  useCanSendNotesToActiveTerminal,
  type ActiveAgentNotesSendResult
} from '@/lib/active-agent-note-send'
import {
  deriveNotesSendAgentTargets,
  type NotesSendAgentTarget
} from '@/lib/notes-send-agent-targets'
import { agentKindForAgentType, formatAgentTypeLabel } from '@/lib/agent-status'
import { track } from '@/lib/telemetry'
import type { LaunchSource } from '../../../../shared/telemetry-events'
import { translate } from '@/i18n/i18n'

export function ReviewNotesSendMenuContent({
  worktreeId,
  groupId,
  prompt,
  promptDelivery = 'submit-after-ready',
  launchSource = 'notes_send',
  onPromptDelivered
}: {
  worktreeId: string
  groupId: string
  prompt: string
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchSource?: LaunchSource
  onPromptDelivered?: () => void
}): React.JSX.Element {
  const hasPrompt = prompt.trim().length > 0
  const canSendToActiveAgent = useCanSendNotesToActiveTerminal(worktreeId)

  // Why: enumerate every running agent of the worktree so the user can target
  // any of them — not only the focused pane. Derive from store slices in a memo
  // to avoid the new-array identity churn of selecting the function result.
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const runtimePaneTitlesByTabId = useAppStore((s) => s.runtimePaneTitlesByTabId)
  const sendTargets = useMemo(
    () =>
      deriveNotesSendAgentTargets(
        { agentStatusByPaneKey, tabsByWorktree, terminalLayoutsByTabId, runtimePaneTitlesByTabId },
        worktreeId
      ),
    [
      agentStatusByPaneKey,
      tabsByWorktree,
      terminalLayoutsByTabId,
      runtimePaneTitlesByTabId,
      worktreeId
    ]
  )

  const runNotesSend = useCallback(
    (send: () => Promise<ActiveAgentNotesSendResult>, onSent: () => void) => {
      const pending = toast.loading(
        translate(
          'auto.components.editor.ReviewNotesSendMenuContent.50f7e753ea',
          'Sending notes to active agent...'
        )
      )

      void send()
        .then((result) => {
          if (result.status === 'sent') {
            onSent()
            toast.success(
              translate(
                'auto.components.editor.ReviewNotesSendMenuContent.bb9c69a0c9',
                'Notes sent to active agent.'
              )
            )
            return
          }

          toast.message(activeAgentNotesSendFailureMessage(result.status))
        })
        .catch((error) => {
          console.error('Failed to send notes to active agent:', error)
          toast.error(
            translate(
              'auto.components.editor.ReviewNotesSendMenuContent.f5096c6e4e',
              'Could not send notes to the active agent.'
            )
          )
        })
        .finally(() => {
          toast.dismiss(pending)
        })
    },
    []
  )

  const sendToActiveAgent = useCallback(() => {
    if (!hasPrompt || !canSendToActiveAgent) {
      return
    }

    runNotesSend(
      () => sendNotesToActiveAgentSession({ worktreeId, prompt }),
      () => onPromptDelivered?.()
    )
  }, [canSendToActiveAgent, hasPrompt, runNotesSend, worktreeId, prompt, onPromptDelivered])

  const sendToAgentTarget = useCallback(
    (target: NotesSendAgentTarget) => {
      if (!hasPrompt || target.status !== 'eligible') {
        return
      }

      runNotesSend(
        () =>
          sendNotesToActiveAgentSession({
            worktreeId,
            prompt,
            noteTarget: { tabId: target.tabId, leafId: target.leafId }
          }),
        () => {
          onPromptDelivered?.()
          // Why: mirror the sidebar send-target telemetry so dropdown-routed
          // follow-up notes show up identically on `agent_prompt_sent`.
          track('agent_prompt_sent', {
            agent_kind: agentKindForAgentType(target.agentType),
            launch_source: launchSource,
            request_kind: 'followup'
          })
        }
      )
    },
    [hasPrompt, runNotesSend, worktreeId, prompt, onPromptDelivered, launchSource]
  )

  return (
    <>
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.03378aea75', 'Send notes to')}
      </DropdownMenuLabel>
      {sendTargets.length > 0 ? (
        sendTargets.map((target) => (
          <AgentTargetMenuItem
            key={target.paneKey}
            target={target}
            disabled={!hasPrompt || target.status !== 'eligible'}
            onSend={sendToAgentTarget}
          />
        ))
      ) : (
        // Why: a freshly opened agent has no status entry yet, so it never
        // surfaces as a derived target. Keep the single focused-terminal item as
        // a fallback so notes are still deliverable in that window.
        <DropdownMenuItem
          disabled={!hasPrompt || !canSendToActiveAgent}
          onSelect={sendToActiveAgent}
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <SquareTerminal className="size-3.5" />
          {translate(
            'auto.components.editor.ReviewNotesSendMenuContent.e84705f223',
            'Active agent session'
          )}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.a49800405b', 'New agent')}
      </DropdownMenuLabel>
      <QuickLaunchAgentMenuItems
        worktreeId={worktreeId}
        groupId={groupId}
        onFocusTerminal={focusTerminalTabSurface}
        prompt={prompt}
        promptDelivery={promptDelivery}
        launchSource={launchSource}
        onPromptDelivered={onPromptDelivered}
      />
    </>
  )
}

function AgentTargetMenuItem({
  target,
  disabled,
  onSend
}: {
  target: NotesSendAgentTarget
  disabled: boolean
  onSend: (target: NotesSendAgentTarget) => void
}): React.JSX.Element {
  const tabTitle = target.tabTitle.trim()
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => onSend(target)}
      // Why: surface the ineligibility reason (working/stale/no-terminal) as a
      // hover tooltip rather than inline text, matching DashboardAgentRow's
      // title-attribute treatment of the same disabledReason.
      title={target.status === 'disabled' ? target.disabledReason : undefined}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <SquareTerminal className="size-3.5 shrink-0" />
      <span className="grid min-w-0 flex-1 text-left">
        <span className="truncate">{formatAgentTypeLabel(target.agentType)}</span>
        {tabTitle ? (
          <span className="truncate text-[11px] font-normal text-muted-foreground">{tabTitle}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )
}
