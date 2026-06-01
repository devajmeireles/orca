import type { TerminalTab } from '../../../../shared/types'

export const DISABLED_MAX_LIVE_TERMINAL_PANES = 0

export type TerminalLiveTab = Pick<TerminalTab, 'id' | 'createdAt'>

export type TerminalLiveTabSetArgs = {
  tabsByWorktree: Record<string, readonly TerminalLiveTab[]>
  maxLiveTerminalPanes: number | null | undefined
  requiredTabIds?: ReadonlySet<string>
  recentUseByTabId?: ReadonlyMap<string, number>
}

export function normalizeMaxLiveTerminalPanes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DISABLED_MAX_LIVE_TERMINAL_PANES
  }
  return Math.max(0, Math.min(500, Math.floor(value)))
}

export function computeLiveTerminalTabIds({
  tabsByWorktree,
  maxLiveTerminalPanes,
  requiredTabIds = new Set(),
  recentUseByTabId = new Map()
}: TerminalLiveTabSetArgs): Set<string> | null {
  const limit = normalizeMaxLiveTerminalPanes(maxLiveTerminalPanes)
  if (limit === DISABLED_MAX_LIVE_TERMINAL_PANES) {
    return null
  }

  const allTabs = Object.values(tabsByWorktree).flat()
  const allTabIds = new Set(allTabs.map((tab) => tab.id))
  const live = new Set<string>()
  for (const tabId of requiredTabIds) {
    if (allTabIds.has(tabId)) {
      live.add(tabId)
    }
  }

  const effectiveLimit = Math.max(limit, live.size)
  if (live.size >= effectiveLimit) {
    return live
  }

  const candidates = allTabs
    .filter((tab) => !live.has(tab.id))
    .sort((left, right) => {
      const leftRecent = recentUseByTabId.get(left.id) ?? Number.NEGATIVE_INFINITY
      const rightRecent = recentUseByTabId.get(right.id) ?? Number.NEGATIVE_INFINITY
      if (leftRecent !== rightRecent) {
        return rightRecent - leftRecent
      }
      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt
      }
      return left.id.localeCompare(right.id)
    })

  for (const tab of candidates) {
    if (live.size >= effectiveLimit) {
      break
    }
    live.add(tab.id)
  }

  return live
}
