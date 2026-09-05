"use client";

import type { CatalogProductDetailResponseDto, ProductVariantDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, catalogApi } from "../../lib/api";
import { formatMoney } from "./catalog-utils";

function variantMatches(variant: ProductVariantDto, selected: Readonly<Record<string, string>>): boolean {
  const selectedEntries = Object.entries(selected).filter(([, value]) => Boolean(value));
  if (selectedEntries.length === 0) return variant.optionValues.length === 0;
  return variant.optionValues.length === selectedEntries.length &&
    variant.optionValues.every((selection) => selected[selection.optionId] === selection.valueId);
}

function initialSelection(product: CatalogProductDetailResponseDto): Record<string, string> {
  const firstVariant = product.variants[0];
  if (!firstVariant) return {};
  return Object.fromEntries(firstVariant.optionValues.map((selection) => [selection.optionId, selection.valueId]));
}

function valueHasCompatibleVariant(
  variants: readonly ProductVariantDto[],
  optionId: string,
  valueId: string,
  selected: Readonly<Record<string, string>>,
): boolean {
  return variants.some((variant) => {
    const hasTarget = variant.optionValues.some(
      (selection) => selection.optionId === optionId && selection.valueId === valueId,
    );
    if (!hasTarget) return false;
    return variant.optionValues.every((selection) => {
      if (selection.optionId === optionId) return true;
      const selectedValue = selected[selection.optionId];
      return !selectedValue || selectedValue === selection.valueId;
    });
  });
}

export function ProductDetailBrowser({ productId }: Readonly<{ productId: string }>) {
  const [product, setProduct] = useState<CatalogProductDetailResponseDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const next = await catalogApi.getCatalogProduct(productId);
      setProduct(next);
      setSelected(initialSelection(next));
      setActiveImage(0);
      setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught, "CartNest could not load this product."));
      setState("error");
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedVariant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((variant) => variantMatches(variant, selected)) ?? null;
  }, [product, selected]);

  if (state === "loading") return <main className="pageShell"><LoadingState label="Loading product…" /></main>;
  if (state === "error" || !product) {
    return <main className="pageShell"><ErrorState title="Product unavailable" message={error ?? "This product could not be loaded."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} /></main>;
  }

  const image = product.media[activeImage] ?? product.media[0];

  return (
    <main className="productDetailPage">
      <div className="productBreadcrumbs">
        <Link href="/marketplace">Marketplace</Link>
        <span aria-hidden="true">/</span>
        <span>{product.category?.name ?? "Product"}</span>
      </div>

      <section className="productDetailGrid">
        <div className="productGallery">
          <div className="productHeroImage">
            {image ? <img src={image.url} alt={image.altText ?? product.name} /> : <span className="catalogImageFallback">CN</span>}
          </div>
          {product.media.length > 1 ? (
            <div className="productThumbs" aria-label="Product images">
              {product.media.map((media, index) => (
                <button
                  key={media.id}
                  type="button"
                  className={index === activeImage ? "productThumb productThumbActive" : "productThumb"}
                  aria-label={`View image ${index + 1}`}
                  aria-pressed={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={media.url} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="productInfoPanel">
          <div className="productInfoTopline">
            <span className="statusPill">{product.category?.name ?? "Uncategorized"}</span>
            <span>{product.store.vendorDisplayName}</span>
          </div>
          <h1 className="pageTitle">{product.name}</h1>
          <p className="productStoreLine">Sold by <strong>{product.store.name}</strong></p>
          <div className="productPrice">{selectedVariant ? formatMoney(selectedVariant.price) : formatMoney(product.priceFrom)}</div>
          <p className="productDescription">{product.description}</p>

          {product.options.length > 0 ? (
            <div className="optionSelectors">
              {product.options.map((option) => (
                <fieldset className="optionSelector" key={option.id}>
                  <legend>{option.name}</legend>
                  <div className="optionValueRow">
                    {option.values.map((value) => {
                      const active = selected[option.id] === value.id;
                      const hasCombination = valueHasCompatibleVariant(
                        product.variants,
                        option.id,
                        value.id,
                        selected,
                      );
                      return (
                        <button
                          key={value.id}
                          type="button"
                          className={active ? "optionValue optionValueActive" : "optionValue"}
                          disabled={!hasCombination}
                          aria-pressed={active}
                          onClick={() => setSelected((current) => ({ ...current, [option.id]: value.id }))}
                        >
                          {value.value}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}

          {selectedVariant ? (
            <div className="variantSummary">
              <div><span>SKU</span><strong>{selectedVariant.sku}</strong></div>
              <div><span>Variant</span><strong>{selectedVariant.optionValues.length > 0 ? selectedVariant.optionValues.map((item) => item.value).join(" / ") : "Standard"}</strong></div>
            </div>
          ) : (
            <p className="formMessage formMessageError" role="status">This option combination is not currently available. Choose another value.</p>
          )}

          <div className="productPhaseNotice">
            <strong>Secure marketplace listing</strong>
            <span>CartNest only exposes products from active stores, approved vendors, accepted moderation states and active variants.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
