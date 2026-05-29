export type PendingSettingsNavigationAction =
  | {
      type: 'activate-section'
      sectionId: string
    }
  | {
      type: 'clear-search'
    }
  | {
      type: 'scroll-to-target'
      sectionId: string
      scrollTargetId: string
    }
  | {
      type: 'wait-for-target'
    }
  | {
      type: 'none'
    }

export function getPendingSettingsNavigationAction(args: {
  scrollTargetId: string | null
  pendingNavSectionId: string | null
  activeSectionId: string
  visibleSectionIds: Set<string>
  query: string
  scrollTargetExists: boolean
}): PendingSettingsNavigationAction {
  if (!args.scrollTargetId || !args.pendingNavSectionId) {
    return { type: 'none' }
  }

  if (args.query.trim() !== '') {
    return { type: 'clear-search' }
  }

  if (!args.visibleSectionIds.has(args.pendingNavSectionId)) {
    return { type: 'none' }
  }

  if (args.activeSectionId !== args.pendingNavSectionId) {
    return { type: 'activate-section', sectionId: args.pendingNavSectionId }
  }

  if (!args.scrollTargetExists) {
    return { type: 'wait-for-target' }
  }

  return {
    type: 'scroll-to-target',
    sectionId: args.pendingNavSectionId,
    scrollTargetId: args.scrollTargetId
  }
}
