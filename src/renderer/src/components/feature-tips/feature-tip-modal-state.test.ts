import { describe, expect, it } from 'vitest'
import { getDefaultVoiceSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/types'
import { getFeatureTipForModal } from './feature-tip-modal-state'

function makeSettings(voiceEnabled = false): Pick<GlobalSettings, 'voice'> {
  return {
    voice: {
      ...getDefaultVoiceSettings(),
      enabled: voiceEnabled
    }
  }
}

describe('feature tip modal state', () => {
  it('keeps rendering the opened tip after app open has marked it seen', () => {
    const tip = getFeatureTipForModal({
      modalData: { tipId: 'voice-dictation' },
      seenTipIds: ['voice-dictation'],
      settings: makeSettings()
    })

    expect(tip?.id).toBe('voice-dictation')
  })

  it('falls back to session-persistence when no modal tip id is pinned and no tips are seen', () => {
    const tip = getFeatureTipForModal({
      modalData: {},
      seenTipIds: [],
      settings: makeSettings()
    })

    // session-persistence is the newest tip and takes priority
    expect(tip?.id).toBe('session-persistence')
  })

  it('falls back to voice-dictation when session-persistence has been seen', () => {
    const tip = getFeatureTipForModal({
      modalData: {},
      seenTipIds: ['session-persistence'],
      settings: makeSettings()
    })

    expect(tip?.id).toBe('voice-dictation')
  })

  it('keeps rendering session-persistence tip when pinned even after seen', () => {
    const tip = getFeatureTipForModal({
      modalData: { tipId: 'session-persistence' },
      seenTipIds: ['session-persistence'],
      settings: makeSettings()
    })

    expect(tip?.id).toBe('session-persistence')
  })

  it('returns no tip when every tip is already seen and no modal tip id is pinned', () => {
    const tip = getFeatureTipForModal({
      modalData: {},
      seenTipIds: ['voice-dictation', 'session-persistence'],
      settings: makeSettings()
    })

    expect(tip).toBeNull()
  })
})
