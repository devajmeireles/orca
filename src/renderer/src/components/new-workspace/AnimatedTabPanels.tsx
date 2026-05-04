import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'quick' | 'create-from'

/**
 * Keeps both tab panels mounted so their local state (typed query on
 * Create-from, repo pick / workspace name on Quick) survives a tab swap.
 * Only the active panel is in normal flow; the inactive panel is
 * absolutely positioned + `visibility: hidden` + `pointer-events-none`
 * so it
 *   (a) doesn't contribute to DialogContent's scrollHeight (otherwise the
 *       host dialog grows a scrollbar whenever the inactive panel is
 *       taller than the active one), and
 *   (b) keeps its React subtree mounted (no remount, so input focus,
 *       typed query, and selection survive).
 *
 * The wrapper's height is JS-driven: a ResizeObserver on the active
 * panel's inner node keeps wrapper height in sync with content so the
 * wrapper never clips. On tab change we capture the pre-swap wrapper
 * height and transition to the new active panel's measured height — a
 * FLIP-style animation so the modal resizes smoothly rather than
 * snapping.
 */
export default function AnimatedTabPanels({
  active,
  children
}: {
  active: TabKey
  children: Record<TabKey, React.ReactNode>
}): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const quickRef = useRef<HTMLDivElement | null>(null)
  const createFromRef = useRef<HTMLDivElement | null>(null)
  const previousActiveRef = useRef<TabKey>(active)
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Why: track the active panel's intrinsic height via ResizeObserver so
  // the wrapper follows content (Advanced drawer open/close, async search
  // results landing). When active changes, the FLIP effect below runs
  // first (capturing the outgoing height), then this observer swings the
  // wrapper height toward the new active panel's height via the CSS
  // transition on `height`.
  //
  // Why offsetHeight and not getBoundingClientRect().height: Radix's
  // dialog open animation (`data-[state=open]:zoom-in-95`) scales the
  // dialog from 0.95 → 1.0 over 200ms. getBoundingClientRect reports the
  // *visual* (transformed) height, so the very first measurement lands at
  // ~95 % of the real layout size and pins that into the inline height.
  // The ResizeObserver never refires because actual layout size didn't
  // change — only the transform did — so the wrapper stays permanently
  // ~16 px short and clips the Create Workspace button at the bottom.
  // offsetHeight returns the un-transformed layout box, which is what the
  // wrapper should match.
  useLayoutEffect(() => {
    const target = active === 'quick' ? quickRef.current : createFromRef.current
    if (!target) {
      return
    }
    const update = (): void => {
      const next = target.offsetHeight
      if (next > 0) {
        setWrapperHeight(next)
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(target)
    return () => observer.disconnect()
  }, [active])

  // Why: on tab swap, override the observer-driven height for one frame
  // so the transition starts from the outgoing panel's size. Without this
  // the wrapper would snap to the new panel's height before the ResizeObserver
  // could read it.
  useLayoutEffect(() => {
    const prev = previousActiveRef.current
    previousActiveRef.current = active
    if (prev === active) {
      return
    }
    const wrapper = wrapperRef.current
    if (!wrapper) {
      return
    }
    // Why: offsetHeight, not getBoundingClientRect — see comment on the
    // observer effect above. Same transform-scale trap applies to this
    // FLIP capture if a tab swap happens while any ancestor transform is
    // still animating.
    const from = wrapper.offsetHeight
    if (from > 0) {
      setWrapperHeight(from)
      setIsAnimating(true)
    }
  }, [active])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || !isAnimating) {
      return
    }
    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName !== 'height') {
        return
      }
      setIsAnimating(false)
    }
    wrapper.addEventListener('transitionend', onEnd)
    return () => wrapper.removeEventListener('transitionend', onEnd)
  }, [isAnimating])

  return (
    <div
      ref={wrapperRef}
      // Why: `overflow: clip` isolates the absolutely-positioned inactive
      // panel so the wrapper's measured height drives the dialog (not the
      // stacked panel heights). We avoid plain `overflow: hidden` because
      // that also clips the 3px focus rings painted by nested inputs
      // (RepoCombobox, workspace name field, etc.) — the inner panels are
      // `inset-x-0` so their triggers sit flush against the wrapper edges,
      // leaving no room for a ring to paint. `overflow-clip-margin` gives
      // the ring breathing room on every side without re-introducing scroll
      // containers or letting the inactive panel leak layout.
      className={cn(
        'relative overflow-clip',
        isAnimating && 'transition-[height] duration-200 ease-out'
      )}
      style={{
        ...(wrapperHeight !== null ? { height: wrapperHeight } : null),
        overflowClipMargin: '8px'
      }}
    >
      <div
        ref={quickRef}
        data-composer-panel="quick"
        className={cn(
          'pt-4',
          active === 'quick'
            ? 'pointer-events-auto'
            : 'pointer-events-none invisible absolute inset-x-0 top-0'
        )}
        aria-hidden={active !== 'quick'}
      >
        {children.quick}
      </div>
      <div
        ref={createFromRef}
        data-composer-panel="create-from"
        className={cn(
          'pt-3',
          active === 'create-from'
            ? 'pointer-events-auto'
            : 'pointer-events-none invisible absolute inset-x-0 top-0'
        )}
        aria-hidden={active !== 'create-from'}
      >
        {children['create-from']}
      </div>
    </div>
  )
}
