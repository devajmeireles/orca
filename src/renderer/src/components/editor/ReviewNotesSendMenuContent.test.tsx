import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry, AgentStatusState } from '../../../../shared/agent-status-types'
import type { TuiAgent } from '../../../../shared/types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { ReviewNotesSendMenuContent } from './ReviewNotesSendMenuContent'

type ReactElementLike = {
  type: unknown
  props: Record<string, unknown>
}

const TAB_A = 'tab-a'
const TAB_B = 'tab-b'
const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

const hookRuntime = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  cleanups: [] as (() => void)[]
}))

const harness = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
  sendNotesToActiveAgentSession: vi.fn(),
  useCanSendNotesToActiveTerminal: vi.fn(() => false),
  track: vi.fn()
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react') // eslint-disable-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  return {
    ...actual,
    useCallback<T extends (...args: never[]) => unknown>(callback: T): T {
      return callback
    },
    useMemo<T>(factory: () => T): T {
      return factory()
    },
    useEffect(effect: () => void | (() => void)): void {
      const cleanup = effect()
      if (typeof cleanup === 'function') {
        hookRuntime.cleanups.push(cleanup)
      }
    },
    useState<T>(initial: T | (() => T)) {
      const stateIndex = hookRuntime.index++
      if (!(stateIndex in hookRuntime.states)) {
        hookRuntime.states[stateIndex] =
          typeof initial === 'function' ? (initial as () => T)() : initial
      }
      const setState = (next: T | ((previous: T) => T)): void => {
        hookRuntime.states[stateIndex] =
          typeof next === 'function'
            ? (next as (previous: T) => T)(hookRuntime.states[stateIndex] as T)
            : next
      }
      return [hookRuntime.states[stateIndex] as T, setState] as const
    }
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(harness.storeState)
}))

vi.mock('@/lib/active-agent-note-send', () => ({
  activeAgentNotesSendFailureMessage: (status: string) => status,
  sendNotesToActiveAgentSession: harness.sendNotesToActiveAgentSession,
  useCanSendNotesToActiveTerminal: harness.useCanSendNotesToActiveTerminal
}))

vi.mock('@/lib/telemetry', () => ({
  track: harness.track
}))

vi.mock('@/components/tab-bar/QuickLaunchButton', () => ({
  QuickLaunchAgentMenuItems: function QuickLaunchAgentMenuItems(props: Record<string, unknown>) {
    return { type: 'QuickLaunchAgentMenuItems', props }
  }
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: function DropdownMenuItem(props: Record<string, unknown>) {
    return { type: 'DropdownMenuItem', props }
  },
  DropdownMenuLabel: function DropdownMenuLabel(props: Record<string, unknown>) {
    return { type: 'DropdownMenuLabel', props }
  },
  DropdownMenuSeparator: function DropdownMenuSeparator(props: Record<string, unknown>) {
    return { type: 'DropdownMenuSeparator', props }
  }
}))

vi.mock('@/lib/focus-terminal-tab-surface', () => ({
  focusTerminalTabSurface: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    message: vi.fn(),
    success: vi.fn()
  }
}))

function agentEntry(
  paneKey: string,
  agentType: TuiAgent,
  state: AgentStatusState = 'done'
): AgentStatusEntry {
  const updatedAt = Date.now()
  return {
    paneKey,
    state,
    prompt: '',
    updatedAt,
    stateStartedAt: updatedAt,
    agentType,
    stateHistory: []
  }
}

function tab(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    worktreeId: 'wt-1',
    ptyId: null,
    title: id,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

function leafLayout(leafId: string, ptyId: string) {
  return {
    root: { type: 'leaf', leafId },
    activeLeafId: leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leafId]: ptyId }
  }
}

function setStore(overrides: Record<string, unknown> = {}): void {
  harness.storeState = {
    agentStatusByPaneKey: {},
    tabsByWorktree: { 'wt-1': [] },
    terminalLayoutsByTabId: {},
    runtimePaneTitlesByTabId: {},
    ...overrides
  }
}

function expand(node: unknown): unknown {
  if (node == null || typeof node === 'string' || typeof node === 'number') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map((entry) => expand(entry))
  }
  if (!React.isValidElement(node)) {
    if (typeof node === 'object' && 'props' in node) {
      const element = node as ReactElementLike
      return { ...element, props: { ...element.props, children: expand(element.props.children) } }
    }
    return node
  }
  const element = node as React.ReactElement<Record<string, unknown>>
  if (typeof element.type === 'function') {
    const Component = element.type as (props: Record<string, unknown>) => unknown
    return expand(Component(element.props))
  }
  return {
    type: element.type,
    props: { ...element.props, children: expand(element.props.children) }
  }
}

function visit(node: unknown, cb: (node: ReactElementLike) => void): void {
  if (node == null || typeof node === 'string' || typeof node === 'number') {
    return
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => visit(entry, cb))
    return
  }
  const element = node as ReactElementLike
  cb(element)
  if (element.props?.children) {
    visit(element.props.children, cb)
  }
}

function findAllByType(node: unknown, type: unknown): ReactElementLike[] {
  const found: ReactElementLike[] = []
  visit(node, (entry) => {
    if (entry.type === type) {
      found.push(entry)
    }
  })
  return found
}

function findByType(node: unknown, type: unknown): ReactElementLike {
  const found = findAllByType(node, type)[0]
  if (!found) {
    throw new Error(`element not found: ${String(type)}`)
  }
  return found
}

function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string') {
    return node
  }
  if (typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join('')
  }
  const element = node as ReactElementLike
  return collectText(element.props?.children)
}

function render(props: Record<string, unknown> = {}): unknown {
  hookRuntime.index = 0
  return expand(
    <ReviewNotesSendMenuContent worktreeId="wt-1" groupId="group-1" prompt="my notes" {...props} />
  )
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ReviewNotesSendMenuContent', () => {
  beforeEach(() => {
    hookRuntime.states = []
    hookRuntime.index = 0
    hookRuntime.cleanups = []
    harness.sendNotesToActiveAgentSession.mockReset()
    harness.sendNotesToActiveAgentSession.mockResolvedValue({ status: 'sent' })
    harness.useCanSendNotesToActiveTerminal.mockReset()
    harness.useCanSendNotesToActiveTerminal.mockReturnValue(false)
    harness.track.mockReset()
    setStore()
  })

  it('enumerates each running agent of the worktree as a send target', () => {
    const statusPaneKey = makePaneKey(TAB_A, LEAF_A)
    setStore({
      agentStatusByPaneKey: { [statusPaneKey]: agentEntry(statusPaneKey, 'claude', 'done') },
      tabsByWorktree: {
        'wt-1': [
          tab(TAB_A, { title: 'Terminal 1' }),
          tab(TAB_B, { title: 'Codex', launchAgent: 'codex' })
        ]
      },
      terminalLayoutsByTabId: {
        [TAB_A]: leafLayout(LEAF_A, 'pty-a'),
        [TAB_B]: leafLayout(LEAF_B, 'pty-b')
      }
    })

    const tree = render()
    const items = findAllByType(tree, 'DropdownMenuItem')

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.props.disabled === false)).toBe(true)
    expect(collectText(items[0])).toContain('Claude')
    expect(collectText(items[1])).toContain('Codex')
  })

  it('sends notes to the chosen agent and tracks the send once it succeeds', async () => {
    const statusPaneKey = makePaneKey(TAB_A, LEAF_A)
    const onPromptDelivered = vi.fn()
    setStore({
      agentStatusByPaneKey: { [statusPaneKey]: agentEntry(statusPaneKey, 'claude', 'done') },
      tabsByWorktree: { 'wt-1': [tab(TAB_A, { title: 'Terminal 1' })] },
      terminalLayoutsByTabId: { [TAB_A]: leafLayout(LEAF_A, 'pty-a') }
    })

    const tree = render({ onPromptDelivered })
    ;(findByType(tree, 'DropdownMenuItem').props.onSelect as () => void)()
    await flushMicrotasks()

    expect(harness.sendNotesToActiveAgentSession).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      prompt: 'my notes',
      noteTarget: { tabId: TAB_A, leafId: LEAF_A }
    })
    expect(onPromptDelivered).toHaveBeenCalledTimes(1)
    expect(harness.track).toHaveBeenCalledWith('agent_prompt_sent', {
      agent_kind: 'claude-code',
      launch_source: 'notes_send',
      request_kind: 'followup'
    })
  })

  it('disables a working agent and never sends to it', () => {
    const statusPaneKey = makePaneKey(TAB_A, LEAF_A)
    setStore({
      agentStatusByPaneKey: { [statusPaneKey]: agentEntry(statusPaneKey, 'claude', 'working') },
      tabsByWorktree: { 'wt-1': [tab(TAB_A, { title: 'Terminal 1' })] },
      terminalLayoutsByTabId: { [TAB_A]: leafLayout(LEAF_A, 'pty-a') }
    })

    const tree = render()
    const item = findByType(tree, 'DropdownMenuItem')

    expect(item.props.disabled).toBe(true)
    expect(item.props.title).toBe('Agent is working')
    ;(item.props.onSelect as () => void)()
    expect(harness.sendNotesToActiveAgentSession).not.toHaveBeenCalled()
  })

  it('falls back to the active agent session when no agents are derived', async () => {
    harness.useCanSendNotesToActiveTerminal.mockReturnValue(true)

    const tree = render()
    const items = findAllByType(tree, 'DropdownMenuItem')

    expect(items).toHaveLength(1)
    expect(collectText(items[0])).toContain('Active agent session')
    ;(items[0].props.onSelect as () => void)()
    await flushMicrotasks()

    expect(harness.sendNotesToActiveAgentSession).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      prompt: 'my notes'
    })
  })

  it('always offers the new-agent launcher', () => {
    const tree = render()

    expect(findByType(tree, 'QuickLaunchAgentMenuItems').props).toMatchObject({
      worktreeId: 'wt-1',
      groupId: 'group-1',
      prompt: 'my notes',
      launchSource: 'notes_send'
    })
  })
})
