import type { ContextualTourPanelPosition } from './contextual-tour-gate'

export function getContextualTourPanelCssPosition(args: {
  position: ContextualTourPanelPosition
  panelHostRect?: Pick<DOMRect, 'left' | 'top'> | null
}): Pick<ContextualTourPanelPosition, 'left' | 'top' | 'arrowOffset'> {
  const { position, panelHostRect } = args
  const left = panelHostRect ? position.left - panelHostRect.left : position.left
  const top = panelHostRect ? position.top - panelHostRect.top : position.top
  return { left, top, arrowOffset: position.arrowOffset }
}
