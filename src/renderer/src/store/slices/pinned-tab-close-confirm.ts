import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

/** A pending request to confirm closing a pinned tab. `onConfirm` runs the
 *  original close once the user accepts; the label is shown in the dialog. */
export type PinnedTabCloseConfirmRequest = {
  tabLabel: string
  onConfirm: () => void
}

export type PinnedTabCloseConfirmSlice = {
  pinnedTabCloseConfirm: PinnedTabCloseConfirmRequest | null
  requestPinnedTabCloseConfirm: (request: PinnedTabCloseConfirmRequest) => void
  confirmPinnedTabClose: () => void
  dismissPinnedTabClose: () => void
}

export const createPinnedTabCloseConfirmSlice: StateCreator<
  AppState,
  [],
  [],
  PinnedTabCloseConfirmSlice
> = (set, get) => ({
  pinnedTabCloseConfirm: null,

  requestPinnedTabCloseConfirm: (request) => set({ pinnedTabCloseConfirm: request }),

  confirmPinnedTabClose: () => {
    const request = get().pinnedTabCloseConfirm
    if (!request) {
      return
    }
    // Why: clear before running onConfirm so a re-entrant close path can't see
    // the stale request and re-open the dialog.
    set({ pinnedTabCloseConfirm: null })
    request.onConfirm()
  },

  dismissPinnedTabClose: () => set({ pinnedTabCloseConfirm: null })
})
