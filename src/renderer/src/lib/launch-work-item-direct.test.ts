import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockToastError = vi.fn()
const mockCreateWorktree = vi.fn()
const mockEnsureDetectedAgents = vi.fn()
const mockUpdateWorktreeMeta = vi.fn()
const mockSetSidebarOpen = vi.fn()
const mockActivateAndRevealWorktree = vi.fn()
const mockPasteDraftWhenAgentReady = vi.fn()
const mockOpenModalFallback = vi.fn()

const store = {
  repos: [
    {
      id: 'repo-1',
      path: '/repo',
      displayName: 'Repo',
      badgeColor: '#fff',
      addedAt: 1
    }
  ],
  settings: {
    defaultTuiAgent: 'codex',
    disabledTuiAgents: [],
    agentCmdOverrides: {}
  },
  ensureDetectedAgents: mockEnsureDetectedAgents,
  ensureRemoteDetectedAgents: vi.fn(),
  createWorktree: mockCreateWorktree,
  updateWorktreeMeta: mockUpdateWorktreeMeta,
  setSidebarOpen: mockSetSidebarOpen
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => store
  }
}))

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    message: vi.fn()
  }
}))

vi.mock('@/lib/agent-paste-draft', () => ({
  pasteDraftWhenAgentReady: mockPasteDraftWhenAgentReady
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mockActivateAndRevealWorktree
}))

vi.mock('@/lib/ensure-hooks-confirmed', () => ({
  ensureHooksConfirmed: vi.fn().mockResolvedValue('run')
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: vi.fn().mockReturnValue(null)
}))

vi.mock('@/runtime/runtime-hooks-client', () => ({
  checkRuntimeHooks: vi.fn().mockResolvedValue({ hooks: null })
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: vi.fn().mockReturnValue({ kind: 'local' }),
  callRuntimeRpc: vi.fn()
}))

vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
  tuiAgentToAgentKind: (agent: string) => agent
}))

describe('launchWorkItemDirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: {} })
    mockEnsureDetectedAgents.mockResolvedValue(['codex'])
    mockCreateWorktree.mockResolvedValue({
      worktree: { id: 'repo-1::/repo/worktree', path: '/repo/worktree' },
      setup: undefined
    })
    mockUpdateWorktreeMeta.mockResolvedValue(undefined)
    mockActivateAndRevealWorktree.mockReturnValue({ primaryTabId: 'tab-1' })
    mockPasteDraftWhenAgentReady.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not report a successful direct launch when saved CLI arguments are invalid', async () => {
    const { launchWorkItemDirect } = await import('./launch-work-item-direct')

    await expect(
      launchWorkItemDirect({
        item: {
          title: 'Fix failing checks',
          url: 'https://github.com/acme/repo/pull/1',
          type: 'issue',
          number: 1,
          pasteContent: 'Fix the failing checks.'
        },
        repoId: 'repo-1',
        openModalFallback: mockOpenModalFallback,
        launchSource: 'task_page',
        agentArgs: '--model "unterminated',
        promptDelivery: 'submit-after-ready'
      })
    ).resolves.toBe(false)

    expect(mockCreateWorktree).toHaveBeenCalled()
    expect(mockActivateAndRevealWorktree).toHaveBeenCalled()
    expect(mockPasteDraftWhenAgentReady).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('Could not build the agent launch command.')
  })
})
