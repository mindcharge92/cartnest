"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../../../components/auth-guard";
import { VendorOrderDetail } from "../../../../../features/orders/vendor-order-detail";

export default function VendorOrderDetailRoute() {
  const params = useParams<{ vendorId: string; vendorOrderId: string }>();
  return (
    <AuthGuard>
      <VendorOrderDetail vendorId={params.vendorId ?? ""} vendorOrderId={params.vendorOrderId ?? ""} />
    </AuthGuard>
  );
}
