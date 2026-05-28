import type { VirtualizedScrollAnchor } from './virtualizedScrollAnchorState'

export function resolveVirtualizedScrollAnchorKey(
  anchor: VirtualizedScrollAnchor,
  rowIndexByKey: ReadonlyMap<string, number>
): { index: number; key: string } | null {
  if (!anchor) {
    return null
  }
  const key = rowIndexByKey.has(anchor.key)
    ? anchor.key
    : anchor.fallbackKeys?.find((fallbackKey) => rowIndexByKey.has(fallbackKey))
  if (!key) {
    return null
  }
  const index = rowIndexByKey.get(key)
  return index === undefined ? null : { index, key }
}
