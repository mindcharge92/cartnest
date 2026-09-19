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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        ...(searchParams.get("store") ? { storeId: searchParams.get("store")! } : {}),
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
  const categoryChips = categories.slice(0, 8);
  const hasFilters = Boolean(searchParams.get("q") || searchParams.get("category") || searchParams.get("store") || searchParams.get("min") || searchParams.get("max"));
  const activeFilterLabels = [
    searchParams.get("q") ? `Search: ${searchParams.get("q")}` : null,
    searchParams.get("category") ? labels.get(searchParams.get("category")!) ?? "Category" : null,
    searchParams.get("store") ? "Featured store" : null,
    searchParams.get("min") ? `From ₦${searchParams.get("min")}` : null,
    searchParams.get("max") ? `Up to ₦${searchParams.get("max")}` : null,
  ].filter((label): label is string => Boolean(label));

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

  function selectCategory(nextCategoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCategoryId) params.set("category", nextCategoryId);
    else params.delete("category");
    params.delete("page");
    router.push(`/marketplace${params.size ? `?${params.toString()}` : ""}`);
  }

  function changeSort(nextSort: SortValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSort === "NEWEST") params.delete("sort");
    else params.set("sort", nextSort);
    params.delete("page");
    router.push(`/marketplace${params.size ? `?${params.toString()}` : ""}`);
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
        <div className="marketplaceIntroRow">
          <div>
            <p className="eyebrow">CartNest marketplace</p>
            <h1 className="marketplaceTitle">Explore the marketplace</h1>
            <p className="marketplaceSubhead">
              Browse products from independent Nigerian stores.
            </p>
          </div>
        </div>
      </section>

      <nav className="categoryRail" aria-label="Marketplace categories">
        <button
          className={`categoryChip ${categoryId ? "" : "categoryChipActive"}`}
          type="button"
          onClick={() => selectCategory("")}
        >
          All products
        </button>
        {categoryChips.map((category) => (
          <button
            key={category.id}
            className={`categoryChip ${categoryId === category.id ? "categoryChipActive" : ""}`}
            type="button"
            onClick={() => selectCategory(category.id)}
          >
            {labels.get(category.id) ?? category.name}
          </button>
        ))}
      </nav>

      <section className="marketplaceLayout">
        <button className="mobileFilterToggle secondaryButton" type="button" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen((open) => !open)}>
          {filtersOpen ? "Hide filters" : "Search and filter"}
        </button>
        <aside id="catalog-filters" className={`catalogFilters${filtersOpen ? " catalogFiltersOpen" : ""}`} aria-label="Product filters">
          <form onSubmit={submit}>
            <div className="filterHeading">
              <h2>Filter products</h2>
              {hasFilters ? <button type="button" className="textButton" onClick={clearFilters}>Clear</button> : null}
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
                  <option key={category.id} value={category.id}>
                    {labels.get(category.id) ?? category.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="filterPriceGrid">
              <label className="field">
                Minimum ₦
                <input inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0.00" />
              </label>
              <label className="field">
                Maximum ₦
                <input inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" />
              </label>
            </div>

            {formError ? <p className="formMessage formMessageError" role="alert">{formError}</p> : null}
            <div className="filterActions">
              <button className="primaryButton" type="submit">Show products</button>
              {hasFilters ? <button className="secondaryButton" type="button" onClick={clearFilters}>Reset all</button> : null}
            </div>
          </form>
        </aside>

        <section className="catalogResults" aria-live="polite">
          {state === "loading" ? <LoadingState label="Loading marketplace products…" /> : null}
          {state === "error" ? (
            <ErrorState
              title="Marketplace unavailable"
              message={error ?? "Products could not be loaded."}
              action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>}
            />
          ) : null}

          {state === "ready" && result ? (
            <>
              <div className="catalogResultHeading">
                <div className="catalogCount">
                  <strong>{result.pagination.totalItems.toLocaleString()} products</strong>
                  <span>Page {result.pagination.page}{result.pagination.totalPages > 0 ? ` of ${result.pagination.totalPages}` : ""}</span>
                </div>

                <label className="catalogSort">
                  Sort
                  <select value={sort} onChange={(event) => changeSort(event.target.value as SortValue)} aria-label="Sort products">
                    <option value="NEWEST">Newest</option>
                    <option value="NAME_ASC">Name A–Z</option>
                    <option value="NAME_DESC">Name Z–A</option>
                  </select>
                </label>
              </div>

              {activeFilterLabels.length > 0 ? (
                <div className="activeFilters" aria-label="Active filters">
                  <span>Showing</span>
                  {activeFilterLabels.map((label) => <strong key={label}>{label}</strong>)}
                  <button type="button" onClick={clearFilters}>Clear all</button>
                </div>
              ) : null}

              {result.items.length === 0 ? (
                <EmptyState
                  title={hasFilters ? "No products matched" : "No products published yet"}
                  message={hasFilters ? "Try clearing a filter, changing the category, or widening the price range." : "Stores have not published listings yet. Please check back soon."}
                  action={hasFilters ? <button className="secondaryButton" type="button" onClick={clearFilters}>Clear filters</button> : undefined}
                />
              ) : (
                <div className="catalogGrid">
                  {result.items.map((product) => (
                    <CatalogProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}

              {result.pagination.totalPages > 1 ? (
                <nav className="pagination" aria-label="Product result pages">
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={result.pagination.page <= 1}
                    onClick={() => movePage(result.pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {result.pagination.page} of {result.pagination.totalPages}</span>
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={result.pagination.page >= result.pagination.totalPages}
                    onClick={() => movePage(result.pagination.page + 1)}
                  >
                    Next
                  </button>
                </nav>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
