"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../../components/auth-guard";
import { VendorInventory } from "../../../../features/inventory/vendor-inventory";

export default function VendorInventoryPage() {
  const params = useParams<{ vendorId: string }>();
  return (
    <AuthGuard>
      <VendorInventory vendorId={params.vendorId ?? ""} />
    </AuthGuard>
  );
}
