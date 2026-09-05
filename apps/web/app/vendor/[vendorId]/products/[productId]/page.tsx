"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "../../../../../components/auth-guard";
import { VendorProductEditor } from "../../../../../features/catalog/vendor-product-editor";

export default function VendorProductPage() {
  const params = useParams<{ vendorId: string; productId: string }>();
  return (
    <AuthGuard>
      <VendorProductEditor vendorId={params.vendorId ?? ""} productId={params.productId ?? ""} />
    </AuthGuard>
  );
}
