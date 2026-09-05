"use client";

import { AuthGuard } from "../../../components/auth-guard";
import { PaymentCallbackPage } from "../../../features/payments/payment-callback-page";

export default function PaymentCallbackRoute() {
  return (
    <AuthGuard>
      <PaymentCallbackPage />
    </AuthGuard>
  );
}
