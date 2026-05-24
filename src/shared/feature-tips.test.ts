import { describe, expect, it } from 'vitest'
import {
  getCompletedFeatureTipIds,
  getOrderedUnseenFeatureTips,
  normalizeFeatureTipIds,
  type FeatureTipId
} from './feature-tips'

describe('feature tips', () => {
  it('orders new unseen tips before older unseen tips', () => {
    const tips = getOrderedUnseenFeatureTips({ seenTipIds: new Set<FeatureTipId>() })

    expect(tips.map((tip) => tip.id)).toEqual(['session-persistence', 'voice-dictation'])
  })

  it('shows only voice-dictation once session-persistence has been seen', () => {
    const tips = getOrderedUnseenFeatureTips({
      seenTipIds: new Set<FeatureTipId>(['session-persistence'])
    })

    expect(tips.map((tip) => tip.id)).toEqual(['voice-dictation'])
  })

  it('skips tips the user has already seen', () => {
    const tips = getOrderedUnseenFeatureTips({
      seenTipIds: new Set<FeatureTipId>(['voice-dictation', 'session-persistence'])
    })

    expect(tips.map((tip) => tip.id)).toEqual([])
  })

  it('skips tips for features the user has already completed', () => {
    const tips = getOrderedUnseenFeatureTips({
      seenTipIds: new Set<FeatureTipId>(),
      completedTipIds: getCompletedFeatureTipIds({ voiceDictationEnabled: true })
    })

    // session-persistence has no completed-state gate — only voice-dictation does
    expect(tips.map((tip) => tip.id)).toEqual(['session-persistence'])
  })

  it('normalizes persisted tip ids', () => {
    expect(normalizeFeatureTipIds(['feature-tour', 'bogus', 'voice-dictation'])).toEqual([
      'voice-dictation'
    ])
  })

  it('normalizes session-persistence tip id', () => {
    expect(normalizeFeatureTipIds(['session-persistence', 'unknown'])).toEqual([
      'session-persistence'
    ])
  })
})
