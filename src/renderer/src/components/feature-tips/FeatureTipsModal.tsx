import type { JSX } from 'react'
import { Mic, Sparkles } from 'lucide-react'
import { getDefaultVoiceSettings } from '../../../../shared/constants'
import type { FeatureTip } from '../../../../shared/feature-tips'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { getFeatureTipForModal } from './feature-tip-modal-state'

const WAVEFORM_BAR_HEIGHTS = [30, 60, 90, 70, 100, 50, 80, 35, 65]

// Session-persistence animation: one terminal pane that dims out (restart beat),
// then fades back in with the same content intact — communicating "survived restart".
function SessionPersistenceVisual(): JSX.Element {
  return (
    <div
      className="session-persist-visual relative h-[92px] w-[220px] overflow-hidden rounded-lg border border-border bg-[var(--editor-surface)] font-mono text-[10px]"
      aria-hidden="true"
    >
      {/* Tab bar */}
      <div className="flex h-[22px] items-center gap-0 border-b border-border px-0">
        <div className="flex h-full items-center gap-1.5 border-r border-border px-2.5 bg-[color-mix(in_srgb,var(--foreground)_6%,var(--editor-surface))]">
          <span className="h-[7px] w-[7px] rounded-sm bg-foreground/20" />
          <span className="text-[9px] text-foreground/50 tracking-tight">terminal</span>
        </div>
      </div>

      {/* Terminal content — same lines before and after restart */}
      <div className="session-persist-content px-2.5 pt-2 space-y-[5px]">
        <div className="flex gap-1.5 items-center">
          <span className="text-[var(--git-decoration-added)] opacity-80">❯</span>
          <span className="h-[7px] w-[72px] rounded-sm bg-foreground/25" />
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="h-[7px] w-[100px] rounded-sm bg-foreground/15" />
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="h-[7px] w-[56px] rounded-sm bg-foreground/15" />
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-[var(--git-decoration-added)] opacity-80">❯</span>
          {/* Blinking cursor */}
          <span className="session-persist-cursor inline-block h-[8px] w-[5px] rounded-[1px] bg-foreground/70" />
        </div>
      </div>

      {/* Restart overlay: fades in/out over the content during the restart beat */}
      <div className="session-persist-restart-overlay absolute inset-0 flex items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--background)_92%,transparent)]">
        <div className="session-persist-restart-icon flex size-8 items-center justify-center rounded-full bg-foreground/10">
          {/* Power/restart ring — simple SVG circle arc */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M13.5 4.5A6 6 0 1 1 4.5 13.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-foreground/60"
            />
            <path
              d="M9 2v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-foreground/60"
            />
          </svg>
        </div>
      </div>

      {/* Restored check: flashes briefly after content fades back in */}
      <div className="session-persist-restored-check absolute inset-0 flex items-end justify-end p-2">
        <div className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--foreground)_10%,var(--editor-surface))] px-1.5 py-0.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4L3 5.5L6.5 2"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--git-decoration-added)]"
            />
          </svg>
          <span className="text-[8px] text-foreground/60 tracking-tight">restored</span>
        </div>
      </div>
    </div>
  )
}

function FeatureTipVisual({ tip }: { tip: FeatureTip }): JSX.Element {
  switch (tip.action) {
    case 'open-session-persistence-release-notes':
      return <SessionPersistenceVisual />
    case 'enable-voice':
      return (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex size-14 items-center justify-center rounded-full bg-foreground text-background">
            <Mic className="size-5" />
          </div>
          {/* Animated waveform — purely decorative, signals "voice" without copy */}
          <div className="flex h-6 items-center justify-center gap-1" aria-hidden="true">
            {WAVEFORM_BAR_HEIGHTS.map((height, i) => (
              <span
                key={i}
                className="block w-[3px] rounded-[2px] bg-foreground/60 animate-waveform"
                style={{ height: `${height}%`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      )
  }
}

export default function FeatureTipsModal(): JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const seenTipIds = useAppStore((s) => s.featureTipsSeenIds)
  const markFeatureTipsSeen = useAppStore((s) => s.markFeatureTipsSeen)
  const modalData = useAppStore((s) => s.modalData)
  const isOpen = activeModal === 'feature-tips'
  const currentTip = getFeatureTipForModal({
    modalData,
    seenTipIds,
    settings
  })

  const markCurrentTipSeen = (): void => {
    if (currentTip) {
      markFeatureTipsSeen([currentTip.id])
    }
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      markCurrentTipSeen()
      closeModal()
    }
  }

  const handleSkip = (): void => {
    markCurrentTipSeen()
    closeModal()
  }

  const handlePrimaryAction = (): void => {
    if (!currentTip) {
      return
    }

    markFeatureTipsSeen([currentTip.id])
    switch (currentTip.action) {
      case 'open-session-persistence-release-notes': {
        // Opens the matching changelog page; the action is named for this specific tip.
        void window.api.shell.openUrl('https://onorca.dev/changelog/1-3-32')
        closeModal()
        break
      }
      case 'enable-voice': {
        const voice = settings?.voice ?? getDefaultVoiceSettings()
        void updateSettings({
          voice: {
            ...voice,
            enabled: true
          }
        })
        closeModal()
        openSettingsTarget({ pane: 'voice', repoId: null })
        openSettingsPage()
      }
    }
  }

  if (!isOpen || !currentTip) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-4 p-7" showCloseButton>
        <DialogHeader className="items-center gap-4 px-8 text-center sm:text-center">
          <Badge
            variant="outline"
            className="gap-1.5 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em]"
          >
            <Sparkles className="size-3" />
            {currentTip.eyebrow}
          </Badge>
          <FeatureTipVisual tip={currentTip} />
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {currentTip.title}
          </DialogTitle>
          <DialogDescription className="max-w-sm text-sm leading-relaxed">
            {currentTip.description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={handleSkip}>
            Maybe Later
          </Button>
          <Button onClick={handlePrimaryAction}>{currentTip.ctaLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
