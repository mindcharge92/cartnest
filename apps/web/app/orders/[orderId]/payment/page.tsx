"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../../components/auth-guard";
import { OrderPaymentPage } from "../../../../features/payments/order-payment-page";

export default function OrderPaymentRoute() {
  const params = useParams<{ orderId: string }>();
  return (
    <AuthGuard>
      <OrderPaymentPage orderId={params.orderId ?? ""} />
    </AuthGuard>
  );
}
