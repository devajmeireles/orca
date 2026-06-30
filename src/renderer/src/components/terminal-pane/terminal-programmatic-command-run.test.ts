import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordTerminalUserInputForLeaf: vi.fn()
}))

vi.mock('./terminal-input-activity', () => ({
  recordTerminalUserInputForLeaf: mocks.recordTerminalUserInputForLeaf
}))

import { handleTerminalProgrammaticCommandRun } from './terminal-programmatic-command-run'

type TestPane = {
  id: number
  leafId: string
  terminal: { focus: ReturnType<typeof vi.fn> }
}

function makePane(overrides: Partial<TestPane> = {}): TestPane {
  return {
    id: 1,
    leafId: 'leaf-1',
    terminal: { focus: vi.fn() },
    ...overrides
  }
}

function makeManager(activePane: TestPane | null, panes: TestPane[]) {
  return {
    getActivePane: vi.fn(() => activePane),
    getPanes: vi.fn(() => panes)
  }
}

function makeTransport(sent = true) {
  return {
    sendInput: vi.fn<(data: string) => boolean>(() => sent)
  }
}

describe('handleTerminalProgrammaticCommandRun', () => {
  beforeEach(() => {
    mocks.recordTerminalUserInputForLeaf.mockReset()
  })

  it('writes raw input to the active pane transport and focuses it', () => {
    const pane = makePane()
    const transport = makeTransport()

    handleTerminalProgrammaticCommandRun({
      detail: { tabId: 'tab-1', input: 'npm run dev\r' },
      tabId: 'tab-1',
      getManager: () => makeManager(pane, [pane]) as never,
      getPaneTransports: () => new Map([[pane.id, transport]]) as never
    })

    expect(transport.sendInput).toHaveBeenCalledWith('npm run dev\r')
    expect(mocks.recordTerminalUserInputForLeaf).toHaveBeenCalledWith('tab-1', 'leaf-1')
    expect(pane.terminal.focus).toHaveBeenCalledOnce()
  })

  it('ignores events addressed to a different tab', () => {
    const pane = makePane()
    const transport = makeTransport()

    handleTerminalProgrammaticCommandRun({
      detail: { tabId: 'other-tab', input: 'npm run dev\r' },
      tabId: 'tab-1',
      getManager: () => makeManager(pane, [pane]) as never,
      getPaneTransports: () => new Map([[pane.id, transport]]) as never
    })

    expect(transport.sendInput).not.toHaveBeenCalled()
  })

  it('does nothing when the active pane has no transport', () => {
    const pane = makePane()

    handleTerminalProgrammaticCommandRun({
      detail: { tabId: 'tab-1', input: 'npm run dev\r' },
      tabId: 'tab-1',
      getManager: () => makeManager(pane, [pane]) as never,
      getPaneTransports: () => new Map() as never
    })

    expect(mocks.recordTerminalUserInputForLeaf).not.toHaveBeenCalled()
    expect(pane.terminal.focus).not.toHaveBeenCalled()
  })

  it('does not record input when the transport rejects the write', () => {
    const pane = makePane()
    const transport = makeTransport(false)

    handleTerminalProgrammaticCommandRun({
      detail: { tabId: 'tab-1', input: 'npm run dev\r' },
      tabId: 'tab-1',
      getManager: () => makeManager(pane, [pane]) as never,
      getPaneTransports: () => new Map([[pane.id, transport]]) as never
    })

    expect(transport.sendInput).toHaveBeenCalledWith('npm run dev\r')
    expect(mocks.recordTerminalUserInputForLeaf).not.toHaveBeenCalled()
    expect(pane.terminal.focus).not.toHaveBeenCalled()
  })

  it('falls back to the first pane when there is no active pane', () => {
    const pane = makePane()
    const transport = makeTransport()

    handleTerminalProgrammaticCommandRun({
      detail: { tabId: 'tab-1', input: 'ls\r' },
      tabId: 'tab-1',
      getManager: () => makeManager(null, [pane]) as never,
      getPaneTransports: () => new Map([[pane.id, transport]]) as never
    })

    expect(transport.sendInput).toHaveBeenCalledWith('ls\r')
  })
})
