import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: getStateMock
  }
}))

import {
  guardPinnedTabClose,
  isUnifiedTabPinned,
  resolvePinnedTabLabel
} from './pinned-tab-close-guard'
import type { AppState } from './types'

function makeState(overrides: Partial<AppState>): AppState {
  return {
    settings: { confirmClosePinnedTab: true },
    unifiedTabsByWorktree: {},
    requestPinnedTabCloseConfirm: vi.fn(),
    ...overrides
  } as unknown as AppState
}

describe('guardPinnedTabClose', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes immediately for a non-pinned tab without touching the store', () => {
    const onClose = vi.fn()
    const requestPinnedTabCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(makeState({ requestPinnedTabCloseConfirm }))

    guardPinnedTabClose({ isPinned: false, tabLabel: 'Docs', onClose })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(requestPinnedTabCloseConfirm).not.toHaveBeenCalled()
  })

  it('requests confirmation for a pinned tab when the setting is on', () => {
    const onClose = vi.fn()
    const requestPinnedTabCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        settings: { confirmClosePinnedTab: true } as AppState['settings'],
        requestPinnedTabCloseConfirm
      })
    )

    guardPinnedTabClose({ isPinned: true, tabLabel: 'Docs', onClose })

    expect(onClose).not.toHaveBeenCalled()
    expect(requestPinnedTabCloseConfirm).toHaveBeenCalledWith({
      tabLabel: 'Docs',
      onConfirm: onClose
    })
  })

  it('closes a pinned tab immediately when the setting is off', () => {
    const onClose = vi.fn()
    const requestPinnedTabCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        settings: { confirmClosePinnedTab: false } as AppState['settings'],
        requestPinnedTabCloseConfirm
      })
    )

    guardPinnedTabClose({ isPinned: true, tabLabel: 'Docs', onClose })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(requestPinnedTabCloseConfirm).not.toHaveBeenCalled()
  })

  it('defaults to confirming when settings are not loaded yet', () => {
    const onClose = vi.fn()
    const requestPinnedTabCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(makeState({ settings: null, requestPinnedTabCloseConfirm }))

    guardPinnedTabClose({ isPinned: true, tabLabel: 'Docs', onClose })

    expect(onClose).not.toHaveBeenCalled()
    expect(requestPinnedTabCloseConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('resolvePinnedTabLabel', () => {
  it('prefers customLabel, then generatedLabel, then label', () => {
    const state = makeState({
      unifiedTabsByWorktree: {
        'wt-1': [
          { id: 'a', entityId: 'ea', customLabel: 'Custom', generatedLabel: 'Gen', label: 'Plain' },
          { id: 'b', entityId: 'eb', customLabel: null, generatedLabel: 'Gen', label: 'Plain' },
          { id: 'c', entityId: 'ec', customLabel: null, generatedLabel: null, label: 'Plain' }
        ]
      } as unknown as AppState['unifiedTabsByWorktree']
    })

    expect(resolvePinnedTabLabel(state, 'wt-1', 'a')).toBe('Custom')
    expect(resolvePinnedTabLabel(state, 'wt-1', 'b')).toBe('Gen')
    expect(resolvePinnedTabLabel(state, 'wt-1', 'ec')).toBe('Plain')
  })

  it('returns an empty string when the tab is not found', () => {
    expect(resolvePinnedTabLabel(makeState({}), 'wt-1', 'missing')).toBe('')
  })
})

describe('isUnifiedTabPinned', () => {
  const state = makeState({
    unifiedTabsByWorktree: {
      'wt-1': [
        { id: 'uni-1', entityId: 'ent-1', isPinned: true },
        { id: 'uni-2', entityId: 'ent-2', isPinned: false }
      ]
    } as unknown as AppState['unifiedTabsByWorktree']
  })

  it('matches a pinned tab by its unified id or entityId', () => {
    expect(isUnifiedTabPinned(state, 'wt-1', 'uni-1')).toBe(true)
    expect(isUnifiedTabPinned(state, 'wt-1', 'ent-1')).toBe(true)
  })

  it('returns false for unpinned or unknown tabs', () => {
    expect(isUnifiedTabPinned(state, 'wt-1', 'uni-2')).toBe(false)
    expect(isUnifiedTabPinned(state, 'wt-1', 'missing')).toBe(false)
    expect(isUnifiedTabPinned(state, 'wt-unknown', 'uni-1')).toBe(false)
  })
})
