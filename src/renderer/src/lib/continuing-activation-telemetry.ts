import type {
  ContinuingActivationCandidateKind as TelemetryCandidateKind,
  ContinuingActivationSurface,
  EventMap
} from '../../../shared/telemetry-events'
import type { ContinuingActivationCandidate } from './continuing-activation-candidates'
import { track } from './telemetry'

export type ContinuingActivationTelemetryEvent =
  | 'continuing_activation_candidate_shown'
  | 'continuing_activation_candidate_clicked'
  | 'continuing_activation_candidate_dismissed'
  | 'continuing_activation_candidate_landed'

type ContinuingActivationTelemetryProps = EventMap['continuing_activation_candidate_shown']

export type TrackContinuingActivation = (
  name: ContinuingActivationTelemetryEvent,
  props: ContinuingActivationTelemetryProps
) => void

function toTelemetryProps(
  candidate: Pick<ContinuingActivationCandidate, 'kind'>,
  surface: ContinuingActivationSurface
): ContinuingActivationTelemetryProps {
  return {
    candidate_kind: candidate.kind as TelemetryCandidateKind,
    surface
  }
}

export function trackContinuingActivationCandidate(
  name: ContinuingActivationTelemetryEvent,
  candidate: Pick<ContinuingActivationCandidate, 'kind'>,
  surface: ContinuingActivationSurface,
  trackFn: TrackContinuingActivation = track
): void {
  trackFn(name, toTelemetryProps(candidate, surface))
}

export function createContinuingActivationShownRecorder(
  trackFn: TrackContinuingActivation = track
): (
  candidate: Pick<ContinuingActivationCandidate, 'id' | 'kind'>,
  surface: ContinuingActivationSurface
) => void {
  const shownKeys = new Set<string>()
  return (candidate, surface) => {
    const key = `${surface}:${candidate.id}`
    if (shownKeys.has(key)) {
      return
    }
    shownKeys.add(key)
    trackContinuingActivationCandidate(
      'continuing_activation_candidate_shown',
      candidate,
      surface,
      trackFn
    )
  }
}
