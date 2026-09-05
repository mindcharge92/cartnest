"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGuard } from "../../../../../components/auth-guard";
import { LoadingState } from "../../../../../components/page-state";
import { ProductCreateForm } from "../../../../../features/catalog/product-create-form";

export default function NewVendorProductPage() {
  const params = useParams<{ vendorId: string }>();
  return (
    <AuthGuard>
      <Suspense fallback={<LoadingState label="Preparing product creator…" />}>
        <ProductCreateForm vendorId={params.vendorId ?? ""} />
      </Suspense>
    </AuthGuard>
  );
}
