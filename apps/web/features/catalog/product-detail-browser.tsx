"use client";

import type { CatalogProductDetailResponseDto } from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { useSession } from "../../components/session-provider";
import { apiErrorMessage, cartApi, catalogApi, wishlistApi } from "../../lib/api";
import { PublicReviews } from "../returns/public-reviews";
import {
  bestVariantForOptionValue,
  formatMoney,
  variantMatchesSelection,
  variantSelection,
} from "./catalog-utils";

function Icon({
  name,
}: Readonly<{ name: "heart" | "shield" | "truck" }>) {
  const paths = {
    heart: <path d="M20 8.7c0 5.2-8 10.4-8 10.4S4 13.9 4 8.7A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8 2.7Z" />,
    shield: (
      <>
        <path d="M12 3.5 19 6v5.1c0 4.4-2.8 8.1-7 9.4-4.2-1.3-7-5-7-9.4V6l7-2.5Z" />
        <path d="m9.1 12 1.9 1.9 4-4" />
      </>
    ),
    truck: (
      <>
        <path d="M3.5 6.5h10v9h-10zM13.5 9h3.2l3.2 3.2v3.3h-6.4z" />
        <circle cx="7" cy="17.2" r="1.7" />
        <circle cx="17.2" cy="17.2" r="1.7" />
      </>
    ),
  } as const;

  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function initialSelection(product: CatalogProductDetailResponseDto): Record<string, string> {
  const firstVariant = product.variants[0];
  return firstVariant ? variantSelection(firstVariant) : {};
}

export function ProductDetailBrowser({ productId }: Readonly<{ productId: string }>) {
  const { session, status: sessionStatus, reloadSession } = useSession();
  const [product, setProduct] = useState<CatalogProductDetailResponseDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [commerceBusy, setCommerceBusy] = useState<"cart" | "wishlist" | null>(null);
  const [commerceMessage, setCommerceMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const next = await catalogApi.getCatalogProduct(productId);
      setProduct(next);
      setSelected(initialSelection(next));
      setActiveImage(0);
      setQuantity("1");
      setCommerceMessage(null);
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
    return product.variants.find((variant) => variantMatchesSelection(variant, selected)) ?? null;
  }, [product, selected]);

  async function addToCart() {
    if (!selectedVariant || !session) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 1000) {
      setCommerceMessage("Quantity must be a whole number between 1 and 1000.");
      return;
    }

    setCommerceBusy("cart");
    setCommerceMessage(null);

    try {
      await cartApi.addItem({ variantId: selectedVariant.id, quantity: parsedQuantity });
      setCommerceMessage(`${parsedQuantity} × ${product?.name ?? "product"} added to your cart.`);
    } catch (caught) {
      setCommerceMessage(apiErrorMessage(caught, "CartNest could not add this variant to your cart."));
    } finally {
      setCommerceBusy(null);
    }
  }

  async function saveToWishlist() {
    if (!selectedVariant || !session || !product) return;

    setCommerceBusy("wishlist");
    setCommerceMessage(null);

    try {
      await wishlistApi.addItem({ productId: product.id, variantId: selectedVariant.id });
      setCommerceMessage("This variant is saved to your wishlist.");
    } catch (caught) {
      setCommerceMessage(apiErrorMessage(caught, "CartNest could not save this variant."));
    } finally {
      setCommerceBusy(null);
    }
  }

  if (state === "loading") {
    return (
      <main className="pageShell">
        <LoadingState label="Loading product…" />
      </main>
    );
  }

  if (state === "error" || !product) {
    return (
      <main className="pageShell">
        <ErrorState
          title="Product unavailable"
          message={error ?? "This product could not be loaded."}
          action={
            <button className="secondaryButton" type="button" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      </main>
    );
  }

  const image = product.media[activeImage] ?? product.media[0];
  const returnTo = "/products/" + encodeURIComponent(productId);
  const price = selectedVariant ? formatMoney(selectedVariant.price) : formatMoney(product.priceFrom);

  return (
    <main className="productDetailPage">
      <div className="productBreadcrumbs">
        <Link href="/marketplace">Marketplace</Link>
        <span aria-hidden="true">/</span>
        <span>{product.category?.name ?? "Product"}</span>
        <span aria-hidden="true">/</span>
        <span className="productBreadcrumbCurrent">{product.name}</span>
      </div>

      <section className="productDetailGrid">
        <div className="productGallery">
          <div className="productHeroImage">
            {image ? (
              <img
                src={image.url}
                alt={image.altText ?? product.name}
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <span className="catalogImageFallback">CN</span>
            )}
          </div>

          {product.media.length > 1 ? (
            <div className="productThumbs" aria-label="Product images">
              {product.media.map((media, index) => (
                <button
                  key={media.id}
                  type="button"
                  className={index === activeImage ? "productThumb productThumbActive" : "productThumb"}
                  aria-label={"View image " + (index + 1)}
                  aria-pressed={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={media.url} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="productFeatureStrip">
            <div>
              <span className="productFeatureIcon"><Icon name="shield" /></span>
              <div><strong>Secure checkout</strong><span>Payments are handled through CartNest checkout.</span></div>
            </div>
            <div>
              <span className="productFeatureIcon"><Icon name="truck" /></span>
              <div><strong>Delivery at checkout</strong><span>Available delivery options are calculated for your order.</span></div>
            </div>
          </div>
        </div>

        <aside className="productInfoPanel">
          <div className="productInfoTopline">
            <span className="statusPill">{product.category?.name ?? "Uncategorized"}</span>
            <button
              className="productInlineSave"
              type="button"
              disabled={!selectedVariant || commerceBusy !== null || sessionStatus !== "authenticated"}
              onClick={() => void saveToWishlist()}
            >
              <Icon name="heart" />
              Save
            </button>
          </div>

          <div>
            <h1 className="productTitle">{product.name}</h1>
            <div className="productStoreLine">
              Sold by <strong>{product.store.name}</strong>
              <span className="storeDot">•</span>
              {product.store.vendorDisplayName}
            </div>
          </div>

          <div className="productPurchasePrice">
            <strong>{price}</strong>
            <span>Current variant price</span>
          </div>

          <p className="productDescription">{product.description}</p>

          {product.options.length > 0 ? (
            <div className="optionSelectors">
              {product.options.map((option) => (
                <fieldset className="optionSelector" key={option.id}>
                  <legend className="optionLegend">
                    <span>{option.name}</span>
                    <span>
                      {selected[option.id]
                        ? option.values.find((value) => value.id === selected[option.id])?.value
                        : "Select an option"}
                    </span>
                  </legend>

                  <div className="optionValueRow">
                    {option.values.map((value) => {
                      const active = selected[option.id] === value.id;
                      const compatibleVariant = bestVariantForOptionValue(
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
                          disabled={!compatibleVariant}
                          aria-pressed={active}
                          onClick={() => {
                            if (compatibleVariant) {
                              setSelected(variantSelection(compatibleVariant));
                              setCommerceMessage(null);
                            }
                          }}
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
              <div>
                <span>SKU</span>
                <strong>{selectedVariant.sku}</strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>
                  {selectedVariant.optionValues.length > 0
                    ? selectedVariant.optionValues.map((item) => item.value).join(" / ")
                    : "Standard"}
                </strong>
              </div>
            </div>
          ) : (
            <p className="formMessage formMessageError" role="status">
              This option combination is not currently available. Choose another value.
            </p>
          )}

          <div className="productBuyCard">
            {sessionStatus === "authenticated" && session ? (
              <>
                <div className="productCommerceControls">
                  <label className="field productQuantity">
                    Quantity
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      disabled={!selectedVariant || commerceBusy !== null}
                    />
                  </label>

                  <button
                    className="primaryButton productAddButton"
                    type="button"
                    disabled={!selectedVariant || commerceBusy !== null}
                    onClick={() => void addToCart()}
                  >
                    {commerceBusy === "cart" ? "Adding…" : "Add to cart"}
                  </button>
                </div>

                {commerceMessage ? (
                  <p className="formMessage" role="status">{commerceMessage}</p>
                ) : null}
              </>
            ) : sessionStatus === "loading" ? (
              <p className="formMessage">Checking your account before enabling cart actions…</p>
            ) : sessionStatus === "unauthenticated" ? (
              <div className="productSignInActions">
                <Link className="primaryButton productAddButton" href={"/login?returnTo=" + encodeURIComponent(returnTo)}>
                  Sign in to add to cart
                </Link>
                <Link className="secondaryButton" href={"/login?returnTo=" + encodeURIComponent(returnTo)}>
                  Sign in to save
                </Link>
              </div>
            ) : (
              <div className="actionRow">
                <p className="formMessage formMessageError">
                  CartNest could not verify your session, so cart and wishlist mutations are disabled until the session check succeeds.
                </p>
                <button className="secondaryButton" type="button" onClick={() => void reloadSession()}>
                  Retry session check
                </button>
              </div>
            )}
          </div>

          <section className="storeSummary">
            <div className="storeSummaryAvatar" aria-hidden="true">
              {product.store.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="storeSummaryBody">
              <div className="storeSummaryHeading">
                <div>
                  <span>Store</span>
                  <strong>{product.store.name}</strong>
                </div>
                <span className="statusPill statusPillGood">Active store</span>
              </div>
              <p>{product.store.vendorDisplayName}</p>
            </div>
          </section>

          <div className="productTrustRow">
            <span><Icon name="shield" /> Cart pricing and stock are revalidated at checkout.</span>
            <span><Icon name="truck" /> Delivery options are calculated from your order.</span>
          </div>
        </aside>
      </section>

      <section className="productDetailsSection">
        <div className="productDetailsHeader">
          <div>
            <p className="eyebrow">Product details</p>
            <h2>About this product</h2>
          </div>
          <span>{product.store.name}</span>
        </div>
        <div className="productDetailsBody">
          <p>{product.description}</p>
        </div>
      </section>

      <PublicReviews productId={product.id} storeId={product.store.id} />
    </main>
  );
}
