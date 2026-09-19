import type { CatalogProductSummaryDto } from "@repo/contracts";
import Link from "next/link";
import { formatMoney } from "./catalog-utils";

export function CatalogProductCard({ product }: Readonly<{ product: CatalogProductSummaryDto }>) {
  const primaryImage = product.media[0];

  return (
    <article className="catalogCard">
      <div className="catalogCardMedia">
        <Link
          className="catalogCardImage"
          href={`/products/${encodeURIComponent(product.id)}`}
          aria-label={`View ${product.name}`}
        >
          {primaryImage ? (
            <img
              src={primaryImage.url}
              alt={primaryImage.altText ?? product.name}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          ) : (
            <span className="catalogImageFallback" aria-hidden="true">CN</span>
          )}
        </Link>
      </div>

      <div className="catalogCardBody">
        <div className="catalogCardMeta">
          <span className="catalogCategory">{product.category?.name ?? "Uncategorized"}</span>
          <span className="catalogStore">{product.store.name}</span>
        </div>

        <h2>
          <Link href={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link>
        </h2>

        <div className="catalogCardFooter">
          <div>
            <small>From</small>
            <strong>{formatMoney(product.priceFrom)}</strong>
          </div>
          <span className="catalogCardVendor">Sold by {product.store.vendorDisplayName}</span>
        </div>

        <Link className="catalogCardAction" href={`/products/${encodeURIComponent(product.id)}`}>
          View product <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
