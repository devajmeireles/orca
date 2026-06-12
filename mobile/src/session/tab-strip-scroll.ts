export type TabStripScrollInput = {
  /** Left edge of the active tab within the scroll content. */
  tabX: number
  /** Width of the active tab. */
  tabWidth: number
  /** Visible width of the horizontal tab strip. */
  viewportWidth: number
  /** Total scrollable content width. */
  contentWidth: number
  /** Current horizontal scroll offset. */
  currentOffset: number
  /** Margin to keep between the tab and the viewport edge when revealing. */
  margin?: number
}

/**
 * Resolve the horizontal offset that brings the active tab fully into view.
 *
 * Returns the current offset unchanged when the tab is already visible so we
 * never scroll on redundant active-tab updates; otherwise reveals the tab with
 * the nearest minimal scroll, clamped to the content bounds.
 */
export function resolveTabStripScrollOffset({
  tabX,
  tabWidth,
  viewportWidth,
  contentWidth,
  currentOffset,
  margin = 12
}: TabStripScrollInput): number {
  const maxOffset = Math.max(0, contentWidth - viewportWidth)
  if (viewportWidth <= 0) {
    return currentOffset
  }

  const visibleStart = currentOffset
  const visibleEnd = currentOffset + viewportWidth
  const tabStart = tabX
  const tabEnd = tabX + tabWidth

  let nextOffset = currentOffset
  if (tabStart < visibleStart + margin) {
    // Off the left edge: align the tab start with the left margin.
    nextOffset = tabStart - margin
  } else if (tabEnd > visibleEnd - margin) {
    // Off the right edge: align the tab end with the right margin.
    nextOffset = tabEnd + margin - viewportWidth
  }

  return Math.min(Math.max(0, nextOffset), maxOffset)
}
