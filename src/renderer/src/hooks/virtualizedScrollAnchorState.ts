export type VirtualizedScrollAnchor = {
  fallbackKeys?: readonly string[]
  key: string
  offset: number
} | null

export const VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT = 'orca-record-virtualized-scroll-anchor'

export function clampVirtualizedScrollAnchorOffset(
  offset: number,
  maxAnchorOffset: number
): number {
  return Math.min(maxAnchorOffset, Math.max(0, offset))
}
