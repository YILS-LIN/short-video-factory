import type { AnalyticsTrackParams } from '../analytics-types'
import { trackAnalyticsEvent } from './analytics/service'

/** @deprecated Callers should migrate to the event-name/data analytics contract. */
export function sendStatEvent(params: AnalyticsTrackParams): Promise<void> {
  return trackAnalyticsEvent(params)
}
