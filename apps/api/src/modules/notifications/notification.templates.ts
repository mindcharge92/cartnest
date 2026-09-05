export type NotificationPriority = "P0" | "P1" | "P2" | "P3" | "P4";

export interface NotificationTemplateDefinition {
  readonly key: string;
  readonly priority: NotificationPriority;
  readonly required: boolean;
  readonly allowedVariables: readonly string[];
}

/**
 * CartNest-owned template keys. External provider template IDs are configuration
 * mapped to these keys and must not become domain identifiers.
 */
export const NOTIFICATION_TEMPLATES = {
  orderCreatedCustomer: {
    key: "order.created.customer.v1",
    priority: "P2",
    required: true,
    allowedVariables: ["orderId", "orderNumber", "amountMinor", "currency", "storeCount"],
  },
  orderCreatedVendor: {
    key: "order.created.vendor.v1",
    priority: "P2",
    required: true,
    allowedVariables: ["orderId", "vendorOrderId", "orderNumber", "storeName"],
  },
  paymentSucceededCustomer: {
    key: "payment.succeeded.customer.v1",
    priority: "P1",
    required: true,
    allowedVariables: ["paymentIntentId", "orderId", "amountMinor", "currency"],
  },
  paymentSucceededVendor: {
    key: "payment.succeeded.vendor.v1",
    priority: "P1",
    required: true,
    allowedVariables: ["paymentIntentId", "orderId", "vendorOrderId"],
  },
  shipmentDeliveredCustomer: {
    key: "shipment.delivered.customer.v1",
    priority: "P3",
    required: true,
    allowedVariables: ["shipmentId", "vendorOrderId", "orderId", "trackingNumber"],
  },
  shipmentDeliveredVendor: {
    key: "shipment.delivered.vendor.v1",
    priority: "P3",
    required: true,
    allowedVariables: ["shipmentId", "vendorOrderId"],
  },
  refundSucceededCustomer: {
    key: "refund.succeeded.customer.v1",
    priority: "P1",
    required: true,
    allowedVariables: ["refundId", "orderId", "amountMinor", "currency"],
  },
  refundSucceededVendor: {
    key: "refund.succeeded.vendor.v1",
    priority: "P1",
    required: true,
    allowedVariables: ["refundId", "vendorOrderId", "amountMinor", "currency"],
  },
  returnStatusCustomer: {
    key: "return.status.customer.v1",
    priority: "P2",
    required: true,
    allowedVariables: ["returnRequestId", "vendorOrderId", "status"],
  },
  returnStatusVendor: {
    key: "return.status.vendor.v1",
    priority: "P2",
    required: true,
    allowedVariables: ["returnRequestId", "vendorOrderId", "status"],
  },
} as const satisfies Record<string, NotificationTemplateDefinition>;

const definitions = new Map<string, NotificationTemplateDefinition>(
  Object.values(NOTIFICATION_TEMPLATES).map((definition) => [definition.key, definition]),
);

export function notificationTemplate(key: string): NotificationTemplateDefinition | undefined {
  return definitions.get(key);
}

export function assertTemplatePayload(
  key: string,
  payload: Readonly<Record<string, unknown>>,
): void {
  const definition = notificationTemplate(key);
  if (!definition) throw new Error(`Unknown notification template: ${key}`);
  const allowed = new Set(definition.allowedVariables);
  for (const property of Object.keys(payload)) {
    if (!allowed.has(property)) throw new Error(`Template ${key} does not allow variable ${property}`);
  }
}
