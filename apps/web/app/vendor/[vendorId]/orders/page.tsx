"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../../components/auth-guard";
import { VendorOrdersPage } from "../../../../features/orders/vendor-orders-page";

export default function VendorOrdersRoute() {
  const params = useParams<{ vendorId: string }>();
  return (
    <AuthGuard>
      <VendorOrdersPage vendorId={params.vendorId ?? ""} />
    </AuthGuard>
  );
}
