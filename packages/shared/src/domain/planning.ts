import { IsoDate, zonedInstant } from './calendar';

export interface PlannedTimes {
  deliveryAt: Date;
  plannedDispatchReadyAt: Date;
  plannedKitchenReadyAt: Date;
}

/**
 * dispatch-ready = delivery − company's lead minutes
 * kitchen-ready  = dispatch-ready − kitchen buffer (30 by default)
 */
export function plannedTimes(
  deliveryDate: IsoDate,
  deliveryTimeMin: number,
  timeZone: string,
  leadMinutes: number,
  kitchenBufferMin: number,
): PlannedTimes {
  const deliveryAt = zonedInstant(deliveryDate, deliveryTimeMin, timeZone);
  const plannedDispatchReadyAt = new Date(deliveryAt.getTime() - leadMinutes * 60_000);
  const plannedKitchenReadyAt = new Date(plannedDispatchReadyAt.getTime() - kitchenBufferMin * 60_000);
  return { deliveryAt, plannedDispatchReadyAt, plannedKitchenReadyAt };
}

export type Urgency = 'DONE' | 'LATE' | 'AT_RISK' | 'ON_TRACK';

/** Late: past the planned time and not done. At risk: within `riskWindowMin` of it. */
export function urgency(planned: Date, doneAt: Date | null, now: Date, riskWindowMin = 30): Urgency {
  if (doneAt) return 'DONE';
  const diff = planned.getTime() - now.getTime();
  if (diff < 0) return 'LATE';
  if (diff <= riskWindowMin * 60_000) return 'AT_RISK';
  return 'ON_TRACK';
}
