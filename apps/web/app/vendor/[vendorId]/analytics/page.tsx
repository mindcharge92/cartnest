"use client";

import { AuthGuard } from "../../../../components/auth-guard";
import { VendorStoreAnalytics } from "../../../../features/analytics/vendor-store-analytics";

export default function VendorAnalyticsPage({ params }: Readonly<{ params: Promise<{ vendorId: string }> }>) {
  return <AuthGuard><VendorStoreAnalytics vendorId={use(params).vendorId} /></AuthGuard>;
}

import { use } from "react";
