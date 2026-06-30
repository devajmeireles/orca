import type { RunTerminalCommandDetail } from '@/constants/terminal'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'

type HandleTerminalProgrammaticCommandRunArgs = {
  detail: RunTerminalCommandDetail | undefined
  tabId: string
  getManager: () => PaneManager | null
  getPaneTransports: () => Map<number, PtyTransport>
}

// Why: re-running a reuse-enabled quick command sends its command into the
// terminal it already spawned. We write raw PTY input (not bracketed paste) so
// the trailing `\r` runs the command instead of landing as literal text. Targets
// the tab's active pane, matching where a typed command would go.
export function handleTerminalProgrammaticCommandRun({
  detail,
  tabId,
  getManager,
  getPaneTransports
}: HandleTerminalProgrammaticCommandRunArgs): void {
  if (!detail?.tabId || detail.tabId !== tabId || !detail.input) {
    return
  }
  const manager = getManager()
  if (!manager) {
    return
  }
  const panes = manager.getPanes()
  const pane = manager.getActivePane() ?? panes[0]
  if (!pane) {
    return
  }
  const transport = getPaneTransports().get(pane.id)
  if (!transport) {
    return
  }

  const sent = transport.sendInput(detail.input)
  if (sent) {
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
    pane.terminal.focus()
  }
}
