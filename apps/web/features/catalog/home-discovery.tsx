"use client";

import type { CatalogProductSummaryDto, CategoryDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, catalogApi } from "../../lib/api";
import { CatalogProductCard } from "./catalog-product-card";

export function HomeDiscovery() {
  const [categories, setCategories] = useState<readonly CategoryDto[]>([]);
  const [products, setProducts] = useState<readonly CatalogProductSummaryDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [categoryResponse, catalogResponse] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listCatalog({ sort: "NEWEST", page: "1", pageSize: "8" }),
      ]);
      setCategories(categoryResponse.items);
      setProducts(catalogResponse.items);
      setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "Products could not be loaded right now."));
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const featuredStores = [...new Map(products.map((product) => [product.store.id, product.store])).values()].slice(0, 3);

  return (
    <>
      {state === "ready" && categories.length > 0 ? (
        <section className="homeDiscoverySection homeLiveCategories" aria-labelledby="home-categories-title">
          <div className="retailSectionHeading">
            <h2 id="home-categories-title">Browse categories</h2>
            <Link href="/marketplace">All products <span aria-hidden="true">→</span></Link>
          </div>
          <div className="homeCategoryLinks">
            {categories.slice(0, 8).map((category) => (
              <Link key={category.id} href={`/marketplace?category=${encodeURIComponent(category.id)}`}>
                {category.name}<span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="homeDiscoverySection productShelf" aria-labelledby="home-products-title">
        <div className="retailSectionHeading">
          <div><p className="eyebrow">Fresh on CartNest</p><h2 id="home-products-title">New arrivals</h2></div>
          <Link href="/marketplace?sort=NEWEST">Shop new arrivals <span aria-hidden="true">→</span></Link>
        </div>
        {state === "loading" ? <LoadingState label="Loading products…" /> : null}
        {state === "error" ? <ErrorState title="Products unavailable" message={error ?? "Please try again."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}
        {state === "ready" && products.length > 0 ? (
          <div className="homeProductsGrid">{products.map((product) => <CatalogProductCard key={product.id} product={product} />)}</div>
        ) : null}
        {state === "ready" && products.length === 0 ? (
          <div className="homeNoProducts retailEmptyState">
            <span className="retailEmptyIndex" aria-hidden="true">New</span>
            <div><h3>The first collection is being curated.</h3>
            <p>Published products will appear here as stores open. Want your products to lead the shelf?</p></div>
            <Link className="primaryButton" href="/vendor">Open your store</Link>
          </div>
        ) : null}
      </section>

      {state === "ready" && featuredStores.length > 0 ? (
        <section className="homeDiscoverySection featuredStoresSection" aria-labelledby="featured-stores-title">
          <div className="retailSectionHeading">
            <div><p className="eyebrow">Meet the businesses</p><h2 id="featured-stores-title">Featured stores</h2></div>
          </div>
          <div className="featuredStoreGrid">
            {featuredStores.map((store, index) => (
              <Link href={`/marketplace?store=${encodeURIComponent(store.id)}`} className={`featuredStore featuredStore--${index + 1}`} key={store.id}>
                <span className="featuredStoreMark" aria-hidden="true">{store.name.slice(0, 1)}</span>
                <div><small>Verified marketplace store</small><strong>{store.name}</strong><span>By {store.vendorDisplayName}</span></div>
                <b aria-hidden="true">→</b>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
