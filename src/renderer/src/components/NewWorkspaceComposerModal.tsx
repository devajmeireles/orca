import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NewWorkspaceComposerCard from '@/components/NewWorkspaceComposerCard'
import AgentSettingsDialog from '@/components/agent/AgentSettingsDialog'
import CreateFromTab from '@/components/new-workspace/CreateFromTab'
import AnimatedTabPanels from '@/components/new-workspace/AnimatedTabPanels'
import { useComposerState } from '@/hooks/useComposerState'
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { shouldSuppressEnterSubmit } from '@/lib/new-workspace-enter-guard'
import type { TuiAgent } from '../../../shared/types'

type ComposerModalData = {
  prefilledName?: string
  initialRepoId?: string
  linkedWorkItem?: LinkedWorkItemSummary | null
  initialBaseBranch?: string
  initialTab?: 'quick' | 'create-from'
}

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
const tabShortcut = {
  quick: isMac ? '⌘N' : 'Ctrl+N',
  'create-from': isMac ? '⌘⇧N' : 'Ctrl+Shift+N'
} as const

function ShortcutHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  // Why: a flat muted string reads as "secondary hint" rather than the
  // bordered kbd chip, which drew too much attention for a label most users
  // will learn once and forget. Stays inside the tab trigger so the hit
  // target covers it too.
  return (
    <span className="text-[10px] font-normal tracking-wide text-muted-foreground/70">
      {children}
    </span>
  )
}

function isRestorablePanelFocusTarget(panel: HTMLElement, target: HTMLElement | null): boolean {
  return Boolean(
    target &&
    target.isConnected &&
    panel.contains(target) &&
    !target.closest('[aria-hidden="true"]') &&
    !target.hasAttribute('disabled') &&
    target.getAttribute('aria-disabled') !== 'true'
  )
}

function getComposerPanelFocusTarget(
  panel: HTMLElement,
  remembered: HTMLElement | null
): HTMLElement | null {
  if (isRestorablePanelFocusTarget(panel, remembered)) {
    return remembered
  }
  for (const selector of [
    '[data-repo-combobox-root="true"][role="combobox"]',
    '[data-create-from-search-input="true"]'
  ]) {
    const target = panel.querySelector<HTMLElement>(selector)
    if (isRestorablePanelFocusTarget(panel, target)) {
      return target
    }
  }
  return null
}

export default function NewWorkspaceComposerModal(): React.JSX.Element | null {
  const visible = useAppStore((s) => s.activeModal === 'new-workspace-composer')
  const modalData = useAppStore((s) => s.modalData as ComposerModalData | undefined)
  const closeModal = useAppStore((s) => s.closeModal)

  // Why: Dialog open-state transitions must be driven by the store, not a
  // mirror useState, so palette/open-modal calls feel instantaneous and the
  // modal doesn't linger with stale data after close.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  if (!visible) {
    return null
  }

  return (
    <ComposerModalBody
      modalData={modalData ?? {}}
      onClose={closeModal}
      onOpenChange={handleOpenChange}
    />
  )
}

function ComposerModalBody({
  modalData,
  onClose,
  onOpenChange
}: {
  modalData: ComposerModalData
  onClose: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const activeTab = useAppStore((s) => s.newWorkspaceComposerTab)
  const setActiveTab = useAppStore((s) => s.setNewWorkspaceComposerTab)

  // Why: when the user starts something on Create-from that needs to fall
  // back to Quick (setup policy = 'ask', PR head resolution failed, ...) we
  // feed the prefill through this local override and remount the Quick
  // composer via a bumped key so its initial state absorbs the new data.
  // Without the key bump the useComposerState hook would keep its first
  // snapshot and the Quick tab would appear empty after fallback.
  const [prefillOverride, setPrefillOverride] = useState<ComposerModalData | null>(null)
  const [quickKey, setQuickKey] = useState(0)

  const effectiveQuickData = prefillOverride ?? modalData

  const handleFallbackToQuick = useCallback(
    (data: {
      initialRepoId?: string
      linkedWorkItem?: LinkedWorkItemSummary | null
      prefilledName?: string
      initialBaseBranch?: string
    }) => {
      setPrefillOverride({ ...data })
      setQuickKey((k) => k + 1)
      setActiveTab('quick')
    },
    [setActiveTab]
  )

  const handleCreateFromLaunched = useCallback(() => {
    onClose()
  }, [onClose])

  // Why: the composer preserves both tab panels across swaps, so users expect
  // their focus context to survive the round-trip too — switching Quick → Create-from
  // → Quick should land them back on the Quick field they were last on, not blow
  // focus back to the top of the form. Track the most recent focused element
  // inside each panel and restore it on tab activation, falling back to the
  // panel's RepoCombobox trigger when nothing is remembered yet.
  const lastFocusedByTabRef = useRef<Record<TabKey, HTMLElement | null>>({
    quick: null,
    'create-from': null
  })

  useEffect(() => {
    const handler = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      // Why: Radix popovers (RepoCombobox list, search results) portal outside
      // the panels, so their focus events resolve to `closest()` → null and
      // we don't pollute the per-panel memory with transient popover focus.
      const panel = target.closest<HTMLElement>('[data-composer-panel]')
      if (!panel) {
        return
      }
      const tab = panel.dataset.composerPanel
      if (tab === 'quick' || tab === 'create-from') {
        lastFocusedByTabRef.current[tab] = target
      }
    }
    document.addEventListener('focusin', handler, true)
    return () => document.removeEventListener('focusin', handler, true)
  }, [])

  const prevActiveTabRef = useRef<TabKey | null>(null)
  useEffect(() => {
    const prev = prevActiveTabRef.current
    prevActiveTabRef.current = activeTab
    // Why: skip the initial mount — the dialog's onOpenAutoFocus below handles
    // that case. This effect only runs for user-driven tab swaps.
    if (prev === null || prev === activeTab) {
      return
    }
    // Why: when the panel class flips from visible → invisible, Chrome blurs
    // whatever element was focused inside the leaving panel. Radix Dialog's
    // FocusScope notices the blur and synchronously focuses the first tabbable
    // inside the dialog (a tab trigger) on a microtask. A plain synchronous
    // focus in this effect lands first, then FocusScope clobbers it.
    // setTimeout(..., 0) schedules our focus as a macrotask, which runs after
    // FocusScope's microtask restoration settles.
    let frame = 0
    const restoreFocus = (): void => {
      const panel = document.querySelector<HTMLElement>(`[data-composer-panel="${activeTab}"]`)
      if (!panel) {
        return
      }
      // Why: the Quick panel is remounted via `quickKey` after a Create-from
      // fallback, and Create-from can hide parts of itself while preserving
      // DOM. Validate the remembered node before restoring it.
      const target = getComposerPanelFocusTarget(panel, lastFocusedByTabRef.current[activeTab])
      target?.focus({ preventScroll: true })
    }
    const timer = window.setTimeout(() => {
      restoreFocus()
      // Why: Radix popover close-auto-focus and tab panel visibility changes
      // can run in the same turn as the tab swap. A frame-late restore makes
      // the active panel win without remounting either tab.
      frame = window.requestAnimationFrame(restoreFocus)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [activeTab])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        // Why: pin a single width across both tabs. Create-from needs the
        // extra horizontal room for PR titles + branch names; Quick tolerates
        // it fine. Animating between widths was jarring and made the modal
        // feel unstable every time the user toggled tabs.
        className="flex flex-col sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          // Why: Radix's FocusScope fires this once the dialog has mounted.
          // preventDefault stops it from focusing whatever first-tabbable it
          // picks (tab trigger, close button), and we instead focus the
          // RepoCombobox inside the active panel so both Quick and Create-from
          // open with the same top-of-form anchor.
          event.preventDefault()
          const content = event.currentTarget as HTMLElement
          const panel = content.querySelector<HTMLElement>(`[data-composer-panel="${activeTab}"]`)
          getComposerPanelFocusTarget(
            panel ?? content,
            lastFocusedByTabRef.current[activeTab]
          )?.focus({ preventScroll: true })
        }}
      >
        <Tabs
          value={activeTab}
          onValueChange={(next) => setActiveTab(next as 'quick' | 'create-from')}
          // Why: both panels are force-mounted so switching tabs preserves
          // their local state (typed query on Create-from, repo pick /
          // workspace name on Quick) instead of remounting each time.
          // Height is driven by the active panel's intrinsic size — the
          // DialogContent handles overflow if the viewport is too short.
          className="flex flex-col gap-0"
        >
          {/* Why: use the shared underline variant so both levels of tabs
              read as "tabs" — the default pill variant fought the sub-tabs
              inside Create-from for visual weight. The bottom border on the
              list gives it clear separation from the content below. */}
          {/* Why: DialogContent has p-6 (24px top) and the close button sits
              absolutely at top-4 (16px), so its 16px icon centers around 24px
              from the top. Pull the h-8 tab list up with -mt-4 so its center
              (8 + 16 = 24px) lines up with the X on the same row. Reserve
              right padding so the last trigger doesn't slide under the X. */}
          <TabsList
            variant="line"
            className="-mt-4 h-8 w-full justify-start gap-6 border-b border-border/60 px-0 pr-8"
          >
            <TabsTrigger value="quick" className="flex-none gap-2 px-0 text-xs font-medium">
              Create
              <ShortcutHint>{tabShortcut.quick}</ShortcutHint>
            </TabsTrigger>
            <TabsTrigger value="create-from" className="flex-none gap-2 px-0 text-xs font-medium">
              Create from…
              <ShortcutHint>{tabShortcut['create-from']}</ShortcutHint>
            </TabsTrigger>
          </TabsList>

          <DialogHeader className="gap-1 pt-4">
            <DialogTitle className="text-base font-semibold">Create Workspace</DialogTitle>
          </DialogHeader>

          <AnimatedTabPanels active={activeTab}>
            {{
              quick: (
                <QuickTabBody
                  key={quickKey}
                  modalData={effectiveQuickData}
                  onClose={onClose}
                  active={activeTab === 'quick'}
                />
              ),
              'create-from': (
                <CreateFromTab
                  onLaunched={handleCreateFromLaunched}
                  onFallbackToQuick={handleFallbackToQuick}
                  active={activeTab === 'create-from'}
                />
              )
            }}
          </AnimatedTabPanels>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function QuickTabBody({
  modalData,
  onClose,
  active
}: {
  modalData: ComposerModalData
  onClose: () => void
  active: boolean
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const { cardProps, composerRef, nameInputRef, submitQuick, createDisabled } = useComposerState({
    initialName: modalData.prefilledName ?? '',
    // Why: the modal is quick-create only now, so prompt-prefill state is
    // intentionally ignored even if older callers still send it.
    initialPrompt: '',
    initialLinkedWorkItem: modalData.linkedWorkItem ?? null,
    initialRepoId: modalData.initialRepoId,
    ...(modalData.initialBaseBranch ? { initialBaseBranch: modalData.initialBaseBranch } : {}),
    persistDraft: false,
    onCreated: onClose
  })
  // Why: the composer's built-in `onOpenAgentSettings` handler navigates to
  // the settings page and closes the modal. For the quick-create flow we want
  // a less disruptive affordance — a nested dialog layered over the composer
  // so the user can tweak agents without losing their in-progress workspace
  // name/repo selection.
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false)
  // Why: once the user picks an agent, their choice wins and must not be
  // overwritten when the derived "preferred" value changes (e.g. detection
  // finishes and adds more installed agents to the set). Track that with an
  // override rather than an effect that mirrors a prop into state — deriving
  // during render keeps the selection in sync with the detected set without
  // triggering an extra commit.
  const [quickAgentOverride, setQuickAgentOverride] = useState<TuiAgent | null | undefined>(
    undefined
  )
  const preferredQuickAgent = useMemo<TuiAgent | null>(() => {
    const pref = settings?.defaultTuiAgent
    if (pref === 'blank') {
      // Why: 'blank' is the explicit "no agent" preference — the quick agent
      // model already uses null to mean "blank terminal", so translate here.
      return null
    }
    if (pref) {
      return pref
    }
    const detected = cardProps.detectedAgentIds
    return AGENT_CATALOG.find((agent) => detected === null || detected.has(agent.id))?.id ?? null
  }, [cardProps.detectedAgentIds, settings?.defaultTuiAgent])
  const quickAgent = quickAgentOverride === undefined ? preferredQuickAgent : quickAgentOverride

  const handleQuickAgentChange = useCallback((agent: TuiAgent | null) => {
    setQuickAgentOverride(agent)
  }, [])

  const handleCreate = useCallback(async (): Promise<void> => {
    await submitQuick(quickAgent)
  }, [quickAgent, submitQuick])

  // Cmd/Ctrl+Enter submits, Esc first blurs the focused input (like the full page).
  useEffect(() => {
    if (!active) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== 'Escape') {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      if (event.key === 'Escape') {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable
        ) {
          event.preventDefault()
          target.blur()
          return
        }
        event.preventDefault()
        onClose()
        return
      }

      // Why: require the platform modifier (Cmd on macOS, Ctrl elsewhere) so
      // plain Enter inside fields (notes, repo search) doesn't accidentally
      // submit — users can type or confirm selections without triggering
      // workspace creation.
      const hasModifier = event.metaKey || event.ctrlKey
      if (!hasModifier) {
        return
      }
      if (!composerRef.current?.contains(target)) {
        return
      }
      if (createDisabled) {
        return
      }
      if (shouldSuppressEnterSubmit(event, false)) {
        return
      }
      event.preventDefault()
      void handleCreate()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [active, composerRef, createDisabled, handleCreate, onClose])

  return (
    <>
      <NewWorkspaceComposerCard
        composerRef={composerRef}
        nameInputRef={nameInputRef}
        quickAgent={quickAgent}
        onQuickAgentChange={handleQuickAgentChange}
        {...cardProps}
        onOpenAgentSettings={() => setAgentSettingsOpen(true)}
        onCreate={() => void handleCreate()}
      />
      <AgentSettingsDialog open={agentSettingsOpen} onOpenChange={setAgentSettingsOpen} />
    </>
  )
}

type TabKey = 'quick' | 'create-from'
