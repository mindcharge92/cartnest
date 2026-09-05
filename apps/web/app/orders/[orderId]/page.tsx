"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../components/auth-guard";
import { BuyerOrderDetail } from "../../../features/orders/buyer-order-detail";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  return (
    <AuthGuard>
      <BuyerOrderDetail orderId={params.orderId ?? ""} />
    </AuthGuard>
  );
}
