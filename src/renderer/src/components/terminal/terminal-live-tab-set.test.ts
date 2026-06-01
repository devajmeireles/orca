import { describe, expect, it } from 'vitest'
import {
  computeLiveTerminalTabIds,
  normalizeMaxLiveTerminalPanes,
  type TerminalLiveTab
} from './terminal-live-tab-set'

function tab(id: string, createdAt: number): TerminalLiveTab {
  return { id, createdAt }
}

describe('computeLiveTerminalTabIds', () => {
  it('returns null when the live pane cap is disabled', () => {
    expect(
      computeLiveTerminalTabIds({
        tabsByWorktree: { 'wt-1': [tab('a', 1), tab('b', 2)] },
        maxLiveTerminalPanes: 0
      })
    ).toBeNull()
  })

  it('keeps required tabs even when they exceed the configured cap', () => {
    const live = computeLiveTerminalTabIds({
      tabsByWorktree: { 'wt-1': [tab('visible-1', 1), tab('visible-2', 2), tab('cold', 3)] },
      maxLiveTerminalPanes: 1,
      requiredTabIds: new Set(['visible-1', 'visible-2'])
    })

    expect(live).toEqual(new Set(['visible-1', 'visible-2']))
  })

  it('fills remaining slots by recent use, then creation time', () => {
    const live = computeLiveTerminalTabIds({
      tabsByWorktree: {
        'wt-1': [tab('old', 1), tab('newer', 2), tab('recent', 0), tab('visible', 3)]
      },
      maxLiveTerminalPanes: 3,
      requiredTabIds: new Set(['visible']),
      recentUseByTabId: new Map([['recent', 10]])
    })

    expect(live).toEqual(new Set(['visible', 'recent', 'newer']))
  })
})

describe('normalizeMaxLiveTerminalPanes', () => {
  it('clamps malformed and extreme values', () => {
    expect(normalizeMaxLiveTerminalPanes(undefined)).toBe(0)
    expect(normalizeMaxLiveTerminalPanes(-1)).toBe(0)
    expect(normalizeMaxLiveTerminalPanes(3.8)).toBe(3)
    expect(normalizeMaxLiveTerminalPanes(999)).toBe(500)
  })
})
