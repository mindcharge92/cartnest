import type { NotificationChannelDto } from "@repo/contracts";

export type ExternalNotificationChannel = Exclude<NotificationChannelDto, "IN_APP">;

export interface NotificationSendInput {
  readonly notificationId: string;
  readonly recipient: string;
  readonly templateKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type NotificationSendResult =
  | {
      readonly kind: "accepted";
      readonly provider: string;
      readonly providerReference?: string;
      readonly delivered?: boolean;
    }
  | {
      readonly kind: "retryable_failure";
      readonly provider: string;
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly kind: "permanent_failure";
      readonly provider: string;
      readonly code: string;
      readonly message: string;
    };

/**
 * Provider-neutral P10 boundary. A later provider choice implements this
 * interface without leaking provider template IDs or DTOs into CartNest.
 */
export interface NotificationChannelAdapter {
  readonly channel: ExternalNotificationChannel;
  readonly provider: string;
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}
