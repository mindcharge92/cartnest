"use client";

import type {
  CategoryDto,
  ProductVariantDto,
  UpdateProductVariantBodyDto,
  VendorMediaDto,
  VendorProductDto,
} from "@repo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, catalogApi } from "../../lib/api";
import { VariantShippingProfileEditor } from "../logistics/variant-shipping-profile-editor";
import { hasVendorPermission } from "../vendor/permissions";
import { useVendorAccess } from "../vendor/use-vendor-access";
import { VendorStatusPill, VendorWorkspaceShell } from "../vendor/vendor-workspace-shell";
import {
  categoryLabels,
  minorToNairaInput,
  parseNairaToMinor,
  slugifyProduct,
} from "./catalog-utils";
import { uploadProductImage } from "./media-upload";

function VariantEditor({
  variant,
  canUpdate,
  onSaved,
}: Readonly<{
  variant: ProductVariantDto;
  canUpdate: boolean;
  onSaved: (variant: ProductVariantDto) => void;
}>) {
  const [sku, setSku] = useState(variant.sku);
  const [price, setPrice] = useState(minorToNairaInput(variant.price.amountMinor));
  const [status, setStatus] = useState<ProductVariantDto["status"]>(variant.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSku(variant.sku);
    setPrice(minorToNairaInput(variant.price.amountMinor));
    setStatus(variant.status);
  }, [variant]);

  async function save() {
    const amountMinor = parseNairaToMinor(price);
    if (!amountMinor) {
      setMessage("Enter a valid NGN price with at most two decimal places.");
      return;
    }
    if (!sku.trim()) {
      setMessage("SKU cannot be empty.");
      return;
    }

    const body: UpdateProductVariantBodyDto = {};
    if (sku.trim() !== variant.sku) body.sku = sku.trim();
    if (amountMinor !== variant.price.amountMinor) body.price = { amountMinor, currency: "NGN" };
    if (status !== variant.status) body.status = status;
    if (Object.keys(body).length === 0) {
      setMessage("No variant changes to save.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const updated = await catalogApi.updateVariant(variant.id, body);
      onSaved(updated);
      setMessage("Variant updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this variant."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{variant.optionValues.length > 0 ? variant.optionValues.map((selection) => `${selection.optionName}: ${selection.value}`).join(" · ") : "Standard"}</td>
      <td><input aria-label={`SKU for ${variant.sku}`} value={sku} onChange={(event) => setSku(event.target.value)} maxLength={100} disabled={!canUpdate || busy} /></td>
      <td><input aria-label={`Price for ${variant.sku}`} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!canUpdate || busy} /></td>
      <td><select aria-label={`Status for ${variant.sku}`} value={status} onChange={(event) => setStatus(event.target.value as ProductVariantDto["status"])} disabled={!canUpdate || busy}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></td>
      <td><VariantShippingProfileEditor variantId={variant.id} canUpdate={canUpdate} /></td>
      <td>
        {canUpdate ? <button className="secondaryButton compactButton" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button> : null}
        {message ? <small className="tableMessage" role="status">{message}</small> : null}
      </td>
    </tr>
  );
}

function MediaCard({
  media,
  canUpdate,
  onChanged,
}: Readonly<{
  media: VendorMediaDto;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
}>) {
  const [altText, setAltText] = useState(media.altText ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(media.displayOrder));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAltText(media.altText ?? "");
    setDisplayOrder(String(media.displayOrder));
  }, [media]);

  async function save() {
    const parsedOrder = Number(displayOrder);
    if (!Number.isInteger(parsedOrder) || parsedOrder < -100000 || parsedOrder > 100000) {
      setMessage("Display order must be a whole number between -100000 and 100000.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await catalogApi.updateMedia(media.id, {
        altText: altText.trim() || null,
        displayOrder: parsedOrder,
      });
      await onChanged();
      setMessage("Image metadata updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this image."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this image from the product?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await catalogApi.deleteMedia(media.id);
      await onChanged();
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not finish deleting this image. You can retry safely."));
      setBusy(false);
    }
  }

  if (media.status === "DELETED") return null;

  return (
    <article className="mediaEditorCard">
      <div className="mediaPreview">{media.url ? <img src={media.url} alt={media.altText ?? "Product media"} /> : <span className="catalogImageFallback">{media.status}</span>}</div>
      <div className="mediaEditorBody">
        <div className="sellerCardTopline"><VendorStatusPill status={media.status} /><span>{media.originalFilename ?? media.mimeType}</span></div>
        <label className="field">Alt text<input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={300} disabled={!canUpdate || busy} /></label>
        <label className="field">Display order<input type="number" min={-100000} max={100000} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} disabled={!canUpdate || busy} /></label>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
        {canUpdate ? <div className="actionRow"><button className="secondaryButton" type="button" disabled={busy} onClick={() => void save()}>Save image</button><button className="dangerButton" type="button" disabled={busy} onClick={() => void remove()}>Delete image</button></div> : null}
      </div>
    </article>
  );
}

export function VendorProductEditor({ vendorId, productId }: Readonly<{ vendorId: string; productId: string }>) {
  const { access, state: accessState, error: accessError, reload: reloadAccess } = useVendorAccess(vendorId);
  const [product, setProduct] = useState<VendorProductDto | null>(null);
  const [categories, setCategories] = useState<readonly CategoryDto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSku, setNewSku] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newSelections, setNewSelections] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileAlt, setFileAlt] = useState("");

  const canRead = access ? hasVendorPermission(access, "product:read") : false;
  const canUpdate = access ? hasVendorPermission(access, "product:update") : false;
  const canArchive = access ? hasVendorPermission(access, "product:archive") : false;
  const labels = useMemo(() => categoryLabels(categories), [categories]);

  const load = useCallback(async () => {
    if (!access || !canRead) return;
    setState("loading");
    setMessage(null);
    try {
      const [nextProduct, categoryResponse] = await Promise.all([
        catalogApi.getVendorProduct(productId),
        catalogApi.listCategories(),
      ]);
      if (nextProduct.vendorId !== vendorId) {
        throw new Error("This product does not belong to the selected vendor workspace.");
      }
      setProduct(nextProduct);
      setCategories(categoryResponse.items);
      setName(nextProduct.name);
      setSlug(nextProduct.slug);
      setDescription(nextProduct.description);
      setCategoryId(nextProduct.category?.id ?? "");
      setNewSelections(Object.fromEntries(nextProduct.options.map((option) => [option.id, option.values[0]?.id ?? ""])));
      setState("ready");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : apiErrorMessage(caught, "CartNest could not load this product."));
      setState("error");
    }
  }, [access, canRead, productId, vendorId]);

  useEffect(() => { void load(); }, [load]);

  if (accessState === "loading") return <LoadingState label="Loading product workspace…" />;
  if (accessState === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={accessError ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" type="button" onClick={() => void reloadAccess()}>Try again</button>} />;
  if (!canRead) return <ErrorState title="Product access restricted" message="This workspace requires product:read access." />;
  if (state === "loading") return <LoadingState label="Loading product…" />;
  if (state === "error" || !product) return <ErrorState title="Product unavailable" message={message ?? "CartNest could not load this product."} action={<button className="secondaryButton" type="button" onClick={() => void load()}>Try again</button>} />;

  const currentProduct = product;
  const isPublic = currentProduct.status === "ACTIVE" && ["NOT_REQUIRED", "APPROVED"].includes(currentProduct.moderationStatus);

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const nextSlug = slugifyProduct(slug);
    if (nextSlug.length < 2) {
      setMessage("Product slug must contain at least two valid characters.");
      return;
    }
    if (!name.trim() || !description.trim()) {
      setMessage("Product name and description are required.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const updated = await catalogApi.updateProduct(currentProduct.id, {
        name: name.trim(),
        slug: nextSlug,
        description: description.trim(),
        categoryId: categoryId || null,
      });
      setProduct(updated);
      setName(updated.name);
      setSlug(updated.slug);
      setDescription(updated.description);
      setCategoryId(updated.category?.id ?? "");
      setMessage(updated.moderationStatus === "PENDING" ? "Product updated and returned to moderation review." : "Product details updated.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not update this product."));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await catalogApi.publishProduct(currentProduct.id);
      setProduct(updated);
      setMessage("Product is now published to the marketplace.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not publish this product."));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm("Archive this product and remove it from active sale?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await catalogApi.archiveProduct(currentProduct.id);
      setProduct(updated);
      setMessage("Product archived.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not archive this product."));
    } finally {
      setBusy(false);
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const amountMinor = parseNairaToMinor(newPrice);
    if (!amountMinor) {
      setMessage("Enter a valid NGN price for the new variant.");
      return;
    }
    if (!newSku.trim()) {
      setMessage("Enter an SKU for the new variant.");
      return;
    }
    const optionValueIds = currentProduct.options.map((option) => newSelections[option.id]).filter((value): value is string => Boolean(value));
    if (optionValueIds.length !== currentProduct.options.length) {
      setMessage("Select one value for every product option.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await catalogApi.addVariant(currentProduct.id, {
        sku: newSku.trim(),
        price: { amountMinor, currency: "NGN" },
        optionValueIds,
      });
      setNewSku("");
      setNewPrice("");
      await load();
      setMessage("Variant added. Add its shipping weight before using GIGL fulfillment.");
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not add this variant."));
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || !file) return;
    setBusy(true);
    setMessage(null);
    try {
      await uploadProductImage({ productId: currentProduct.id, file, ...(fileAlt.trim() ? { altText: fileAlt.trim() } : {}) });
      setFile(null);
      setFileAlt("");
      const input = document.getElementById("product-image-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
      setMessage("Product image uploaded and verified against its declared type.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "CartNest could not upload this image.");
    } finally {
      setBusy(false);
    }
  }

  const canAddVariant = currentProduct.status !== "ARCHIVED" && (currentProduct.options.length > 0 || currentProduct.variants.length === 0);

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div><p className="eyebrow">Product</p><h1 className="pageTitle">{currentProduct.name}</h1><p className="muted">Store-scoped catalog record with normalized options, variants, media and physical shipping profiles.</p></div>
          <div className="sellerCardTopline"><VendorStatusPill status={currentProduct.status} /><VendorStatusPill status={currentProduct.moderationStatus} /></div>
        </div>

        {message ? <p className="formMessage" role="status">{message}</p> : null}

        <section className="productEditorStack">
          <form className="panel sellerForm" onSubmit={saveMetadata}>
            <div className="sectionHeadingCompact">
              <div><h2>Product details</h2><p>If a moderated product changes, CartNest returns it to PENDING instead of preserving stale approval.</p></div>
              {isPublic ? <Link className="textButton" href={`/products/${encodeURIComponent(currentProduct.id)}`}>View public page</Link> : <span className="statusPill">Not public</span>}
            </div>
            <div className="formGrid formGridTwo">
              <label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={200} disabled={!canUpdate || busy} /></label>
              <label className="field">Slug<input value={slug} onChange={(event) => setSlug(slugifyProduct(event.target.value))} minLength={2} maxLength={160} disabled={!canUpdate || busy} /></label>
            </div>
            <label className="field">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={!canUpdate || busy}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{labels.get(category.id) ?? category.name}</option>)}</select></label>
            <label className="field">Description<textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={20000} disabled={!canUpdate || busy} /></label>
            {canUpdate ? <div className="actionRow"><button className="primaryButton" disabled={busy}>Save details</button>{currentProduct.status !== "ARCHIVED" ? <button className="secondaryButton" type="button" disabled={busy} onClick={() => void publish()}>Publish</button> : null}{canArchive && currentProduct.status !== "ARCHIVED" ? <button className="dangerButton" type="button" disabled={busy} onClick={() => void archive()}>Archive</button> : null}</div> : null}
          </form>

          <section className="panel sellerForm">
            <div className="sectionHeadingCompact"><div><h2>Options, variants & shipping</h2><p>Each variant keeps its own SKU/price and physical shipping profile. GIGL quotes require a positive weight for every represented variant.</p></div></div>
            {currentProduct.options.length > 0 ? <div className="optionSnapshot">{currentProduct.options.map((option) => <div key={option.id}><strong>{option.name}</strong><span>{option.values.map((value) => value.value).join(", ")}</span></div>)}</div> : <p className="formMessage">This product uses one standard variant and no option dimensions.</p>}
            <div className="variantCreateTableWrap">
              <table className="dataTable variantCreateTable"><thead><tr><th>Variant</th><th>SKU</th><th>NGN price</th><th>Status</th><th>Shipping</th><th>Action</th></tr></thead><tbody>{currentProduct.variants.map((variant) => <VariantEditor key={variant.id} variant={variant} canUpdate={canUpdate} onSaved={() => void load()} />)}</tbody></table>
            </div>

            {canUpdate && canAddVariant ? (
              <form className="inlineVariantForm" onSubmit={addVariant}>
                <h3>Add variant</h3>
                {currentProduct.options.length > 0 ? <div className="formGrid formGridTwo">{currentProduct.options.map((option) => <label className="field" key={option.id}>{option.name}<select value={newSelections[option.id] ?? ""} onChange={(event) => setNewSelections((current) => ({ ...current, [option.id]: event.target.value }))}>{option.values.map((value) => <option key={value.id} value={value.id}>{value.value}</option>)}</select></label>)}</div> : null}
                <div className="formGrid formGridTwo"><label className="field">SKU<input value={newSku} onChange={(event) => setNewSku(event.target.value)} maxLength={100} required /></label><label className="field">NGN price<input inputMode="decimal" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="0.00" required /></label></div>
                <button className="secondaryButton" disabled={busy}>Add variant</button>
              </form>
            ) : null}
          </section>

          <section className="panel sellerForm">
            <div className="sectionHeadingCompact"><div><h2>Product images</h2><p>JPEG, PNG and WebP up to 10 MB. The API verifies stored image signatures after direct R2 upload.</p></div></div>
            {canUpdate ? <form className="mediaUploadForm" onSubmit={upload}><label className="field">Image<input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label><label className="field">Alt text<input value={fileAlt} onChange={(event) => setFileAlt(event.target.value)} maxLength={300} placeholder="Describe the product image" /></label><button className="secondaryButton" disabled={busy || !file}>{busy ? "Uploading…" : "Upload image"}</button></form> : null}
            {currentProduct.media.filter((media) => media.status !== "DELETED").length === 0 ? <p className="formMessage">No product images have been uploaded yet.</p> : <div className="mediaEditorGrid">{currentProduct.media.filter((media) => media.status !== "DELETED").map((media) => <MediaCard key={media.id} media={media} canUpdate={canUpdate} onChanged={load} />)}</div>}
          </section>
        </section>
      </VendorWorkspaceShell>
    </main>
  );
}
