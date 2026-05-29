import { describe, expect, it } from 'vitest'
import { getPendingSettingsNavigationAction } from './settings-pending-navigation'

describe('settings pending navigation', () => {
  it('activates the Computer Use pane before any target scroll can run', () => {
    const action = getPendingSettingsNavigationAction({
      scrollTargetId: 'computer-use',
      pendingNavSectionId: 'computer-use',
      activeSectionId: 'browser',
      visibleSectionIds: new Set(['browser', 'computer-use']),
      query: '',
      scrollTargetExists: true
    })

    expect(action).toEqual({ type: 'activate-section', sectionId: 'computer-use' })
  })

  it('scrolls only after the pending pane is active and its target exists', () => {
    const action = getPendingSettingsNavigationAction({
      scrollTargetId: 'computer-use',
      pendingNavSectionId: 'computer-use',
      activeSectionId: 'computer-use',
      visibleSectionIds: new Set(['browser', 'computer-use']),
      query: '',
      scrollTargetExists: true
    })

    expect(action).toEqual({
      type: 'scroll-to-target',
      sectionId: 'computer-use',
      scrollTargetId: 'computer-use'
    })
  })

  it('keeps subsection deep links pending until the lazy target row is in the DOM', () => {
    const action = getPendingSettingsNavigationAction({
      scrollTargetId: 'terminal-quick-commands',
      pendingNavSectionId: 'quick-commands',
      activeSectionId: 'quick-commands',
      visibleSectionIds: new Set(['quick-commands']),
      query: '',
      scrollTargetExists: false
    })

    expect(action).toEqual({ type: 'wait-for-target' })
  })

  it('clears search before activating a filtered deep-link target', () => {
    const action = getPendingSettingsNavigationAction({
      scrollTargetId: 'computer-use',
      pendingNavSectionId: 'computer-use',
      activeSectionId: 'browser',
      visibleSectionIds: new Set(['browser']),
      query: 'browser',
      scrollTargetExists: false
    })

    expect(action).toEqual({ type: 'clear-search' })
  })
})
