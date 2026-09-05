import type { LogisticsService } from "./logistics.service.js";

export const LOGISTICS_TRACKING_SYNC_JOB = "logistics.tracking.sync" as const;

export interface LogisticsTrackingSyncJobData {
  readonly limit?: number;
}

/**
 * P8 job handler boundary for BullMQ/worker wiring. The worker may invoke this
 * through the application job registry once shared queue execution is enabled.
 * Provider outages are handled inside LogisticsService without mutating the
 * last trusted shipment state.
 */
export async function runLogisticsTrackingSyncJob(
  service: LogisticsService,
  data: LogisticsTrackingSyncJobData = {},
): Promise<{ updated: number }> {
  return { updated: await service.syncGiglTracking(data.limit ?? 100) };
}
