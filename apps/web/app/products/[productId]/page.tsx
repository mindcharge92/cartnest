"use client";

import { useParams } from "next/navigation";
import { ProductDetailBrowser } from "../../../features/catalog/product-detail-browser";

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  return <ProductDetailBrowser productId={params.productId ?? ""} />;
}
