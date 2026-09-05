"use client";

import type { CatalogProductListResponseDto, CatalogQueryDto, CategoryDto } from "@repo/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, catalogApi } from "../../lib/api";
import { CatalogProductCard } from "./catalog-product-card";
import { categoryLabels, parseNairaToMinor } from "./catalog-utils";

const SORTS = ["NEWEST", "NAME_ASC", "NAME_DESC"] as const;
type SortValue = (typeof SORTS)[number];

function allowedSort(value: string | null): SortValue {
  return SORTS.includes(value as SortValue) ? (value as SortValue) : "NEWEST";
}

export function MarketplaceBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();

  const [categories, setCategories] = useState<readonly CategoryDto[]>([]);
  const [result, setResult] = useState<CatalogProductListResponseDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [categoryId, setCategoryId] = useState(searchParams.get("category") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("min") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max") ?? "");
  const [sort, setSort] = useState<SortValue>(allowedSort(searchParams.get("sort")));

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    setCategoryId(searchParams.get("category") ?? "");
    setMinPrice(searchParams.get("min") ?? "");
    setMaxPrice(searchParams.get("max") ?? "");
    setSort(allowedSort(searchParams.get("sort")));
  }, [queryKey, searchParams]);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const page = searchParams.get("page") ?? "1";
      const minPriceMinor = searchParams.get("min") ? parseNairaToMinor(searchParams.get("min")!) : null;
      const maxPriceMinor = searchParams.get("max") ? parseNairaToMinor(searchParams.get("max")!) : null;
      const query: CatalogQueryDto = {
        ...(searchParams.get("q")?.trim() ? { q: searchParams.get("q")!.trim() } : {}),
        ...(searchParams.get("category") ? { categoryId: searchParams.get("category")! } : {}),
        ...(minPriceMinor ? { minPriceMinor } : {}),
        ...(maxPriceMinor ? { maxPriceMinor } : {}),
        sort: allowedSort(searchParams.get("sort")),
        page,
        pageSize: "24",
      };
      const [categoryResponse, catalogResponse] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listCatalog(query),
      ]);
      setCategories(categoryResponse.items);
      setResult(catalogResponse);
      setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not load the marketplace."));
      setState("error");
    }
  }, [queryKey, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const labels = useMemo(() => categoryLabels(categories), [categories]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const minMinor = minPrice ? parseNairaToMinor(minPrice) : null;
    const maxMinor = maxPrice ? parseNairaToMinor(maxPrice) : null;
    if (minPrice && !minMinor) {
      setFormError("Enter a valid minimum price with at most two decimal places.");
      return;
    }
    if (maxPrice && !maxMinor) {
      setFormError("Enter a valid maximum price with at most two decimal places.");
      return;
    }
    if (minMinor && maxMinor && BigInt(minMinor) > BigInt(maxMinor)) {
      setFormError("Minimum price cannot be greater than maximum price.");
      return;
    }

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("category", categoryId);
    if (minPrice) params.set("min", minPrice.replaceAll(",", ""));
    if (maxPrice) params.set("max", maxPrice.replaceAll(",", ""));
    if (sort !== "NEWEST") params.set("sort", sort);
    router.push(`/marketplace${params.size ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    router.push("/marketplace");
  }

  function movePage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    router.push(`/marketplace${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <main className="marketplacePage">
      <section className="marketplaceIntro">
        <div>
          <p className="eyebrow">CartNest marketplace</p>
          <h1 className="pageTitle">Find products across Nigerian stores.</h1>
          <p className="muted">Search one marketplace while each product remains tied to its real store, vendor and variant pricing.</p>
        </div>
      </section>

      <section className="marketplaceLayout">
        <aside className="catalogFilters" aria-label="Product filters">
          <form onSubmit={submit}>
            <div className="filterHeading">
              <h2>Filter products</h2>
              <button type="button" className="textButton" onClick={clearFilters}>Clear</button>
            </div>
            <label className="field">
              Search
              <input value={q} onChange={(event) => setQ(event.target.value)} maxLength={200} placeholder="Product name or description" />
            </label>
            <label className="field">
              Category
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{labels.get(category.id) ?? category.name}</option>
                ))}
              </select>
            </label>
            <div className="filterPriceGrid">
              <label className="field">Minimum ₦<input inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0.00" /></label>
              <label className="field">Maximum ₦<input inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" /></label>
            </div>
            <label className="field">
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
                <option value="NEWEST">Newest</option>
                <option value="NAME_ASC">Name A–Z</option>
                <option value="NAME_DESC">Name Z–A</option>
              </select>
            </label>
            {formError ? <p className="formMessage formMessageError" role="alert">{formError}</p> : null}
            <button className="primaryButton" type="submit">Apply filters</button>
          </form>
        </aside>

        <section className="catalogResults" aria-live="polite">
          {state === "loading" ? <LoadingState label="Loading marketplace products…" /> : null}
          {state === "error" ? <ErrorState title="Marketplace unavailable" message={error ?? "Products could not be loaded."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /> : null}
          {state === "ready" && result ? (
            <>
              <div className="catalogResultHeading">
                <div>
                  <strong>{result.pagination.totalItems.toLocaleString()} products</strong>
                  <span>Page {result.pagination.page}{result.pagination.totalPages > 0 ? ` of ${result.pagination.totalPages}` : ""}</span>
                </div>
              </div>
              {result.items.length === 0 ? (
                <EmptyState title="No products matched" message="Try clearing a filter, changing the category, or widening the price range." />
              ) : (
                <div className="catalogGrid">
                  {result.items.map((product) => <CatalogProductCard key={product.id} product={product} />)}
                </div>
              )}
              {result.pagination.totalPages > 1 ? (
                <nav className="pagination" aria-label="Product result pages">
                  <button className="secondaryButton" type="button" disabled={result.pagination.page <= 1} onClick={() => movePage(result.pagination.page - 1)}>Previous</button>
                  <span>Page {result.pagination.page} of {result.pagination.totalPages}</span>
                  <button className="secondaryButton" type="button" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => movePage(result.pagination.page + 1)}>Next</button>
                </nav>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
