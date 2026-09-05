import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, UuidSchema } from "./common.js";
import { OrderStatusSchema, PaymentStatusSchema, VendorOrderStatusSchema } from "./orders.js";
import { RefundStatusSchema, ReturnStatusSchema } from "./returns.js";
import { PaymentProviderSchema } from "./vendor.js";
import { ShipmentProviderSchema, ShipmentStatusSchema } from "./logistics.js";

const NullableTimestampSchema = Type.Union([IsoTimestampSchema, Type.Null()]);
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableUuidSchema = Type.Union([UuidSchema, Type.Null()]);

export const AdminOrderOperationsParamsSchema = Type.Object(
  { orderId: UuidSchema },
  { additionalProperties: false },
);
export type AdminOrderOperationsParamsDto = Static<typeof AdminOrderOperationsParamsSchema>;

export const AdminOrderOperationsDetailSchema = Type.Object(
  {
    order: Type.Object(
      {
        id: UuidSchema,
        orderNumber: Type.String(),
        userId: UuidSchema,
        status: OrderStatusSchema,
        paymentStatus: PaymentStatusSchema,
        itemSubtotal: MoneySchema,
        discount: MoneySchema,
        delivery: MoneySchema,
        tax: MoneySchema,
        grandTotal: MoneySchema,
        createdAt: IsoTimestampSchema,
        updatedAt: IsoTimestampSchema,
      },
      { additionalProperties: false },
    ),
    vendorOrders: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          vendorId: UuidSchema,
          storeId: UuidSchema,
          status: VendorOrderStatusSchema,
          itemSubtotal: MoneySchema,
          discount: MoneySchema,
          delivery: MoneySchema,
          tax: MoneySchema,
          commission: MoneySchema,
          gatewayFee: MoneySchema,
          total: MoneySchema,
          acceptedAt: NullableTimestampSchema,
          deliveredAt: NullableTimestampSchema,
        },
        { additionalProperties: false },
      ),
    ),
    paymentIntents: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          status: PaymentStatusSchema,
          amount: MoneySchema,
          attempts: Type.Array(
            Type.Object(
              {
                id: UuidSchema,
                provider: PaymentProviderSchema,
                providerReference: NullableStringSchema,
                providerTransactionId: NullableStringSchema,
                status: PaymentStatusSchema,
                failureCategory: NullableStringSchema,
                confirmedAt: NullableTimestampSchema,
                updatedAt: IsoTimestampSchema,
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    allocations: Type.Array(
      Type.Object(
        {
          paymentIntentId: UuidSchema,
          vendorOrderId: NullableUuidSchema,
          type: Type.String(),
          amount: MoneySchema,
        },
        { additionalProperties: false },
      ),
    ),
    refunds: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          vendorOrderId: NullableUuidSchema,
          provider: PaymentProviderSchema,
          providerRefundReference: NullableStringSchema,
          status: RefundStatusSchema,
          amount: MoneySchema,
          reason: Type.String(),
          createdAt: IsoTimestampSchema,
          completedAt: NullableTimestampSchema,
        },
        { additionalProperties: false },
      ),
    ),
    shipments: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          vendorOrderId: UuidSchema,
          provider: ShipmentProviderSchema,
          trackingNumber: NullableStringSchema,
          status: ShipmentStatusSchema,
          deliveredAt: NullableTimestampSchema,
          updatedAt: IsoTimestampSchema,
        },
        { additionalProperties: false },
      ),
    ),
    returns: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          vendorOrderId: UuidSchema,
          status: ReturnStatusSchema,
          reason: Type.String(),
          requestedAt: IsoTimestampSchema,
          completedAt: NullableTimestampSchema,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type AdminOrderOperationsDetailDto = Static<typeof AdminOrderOperationsDetailSchema>;
