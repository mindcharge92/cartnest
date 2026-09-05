"use client";

import type { CreateProductBodyDto, StoreDto } from "@repo/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/page-state";
import { apiErrorMessage, catalogApi, vendorApi } from "../../lib/api";
import { hasVendorPermission } from "../vendor/permissions";
import { useVendorAccess } from "../vendor/use-vendor-access";
import { VendorWorkspaceShell } from "../vendor/vendor-workspace-shell";
import {
  buildVariantCombinations,
  categoryLabels,
  normalizeOptionDrafts,
  parseNairaToMinor,
  slugifyProduct,
  type ProductOptionDraft,
} from "./catalog-utils";

interface OptionEditor {
  readonly id: number;
  readonly name: string;
  readonly valuesText: string;
}

interface VariantEditor {
  readonly sku: string;
  readonly price: string;
}

function parseOptionEditors(editors: readonly OptionEditor[]): ProductOptionDraft[] {
  return editors.map((editor) => ({
    name: editor.name,
    values: editor.valuesText.split(/[\n,]/g).map((value) => value.trim()).filter(Boolean),
  }));
}

function validateOptions(options: readonly ProductOptionDraft[]): string | null {
  const normalized = normalizeOptionDrafts(options);
  if (normalized.length !== options.filter((option) => option.name.trim() || option.values.length > 0).length) {
    return "Every option needs a name and at least one value.";
  }
  const names = new Set<string>();
  for (const option of normalized) {
    const name = option.name.toLowerCase();
    if (names.has(name)) return `Option name “${option.name}” is duplicated.`;
    names.add(name);
    const values = new Set<string>();
    for (const value of option.values) {
      const key = value.toLowerCase();
      if (values.has(key)) return `${option.name} contains the duplicate value “${value}”.`;
      values.add(key);
    }
  }
  return null;
}

export function ProductCreateForm({ vendorId }: Readonly<{ vendorId: string }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { access, state, error, reload } = useVendorAccess(vendorId);
  const [stores, setStores] = useState<readonly StoreDto[]>([]);
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof catalogApi.listCategories>>["items"]>([]);
  const [storeId, setStoreId] = useState(searchParams.get("storeId") ?? "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [options, setOptions] = useState<readonly OptionEditor[]>([]);
  const [variantEditors, setVariantEditors] = useState<Record<string, VariantEditor>>({ default: { sku: "", price: "" } });
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextOptionId = useRef(1);

  const canReadStores = access ? hasVendorPermission(access, "store:read") : false;
  const canCreateProducts = access ? hasVendorPermission(access, "product:create") : false;
  const parsedOptions = useMemo(() => parseOptionEditors(options), [options]);
  const combinations = useMemo(() => buildVariantCombinations(parsedOptions), [parsedOptions]);
  const labels = useMemo(() => categoryLabels(categories), [categories]);

  useEffect(() => {
    if (!access || !canReadStores || !canCreateProducts) return;
    let cancelled = false;
    void Promise.all([vendorApi.listStores(vendorId), catalogApi.listCategories()])
      .then(([storeResponse, categoryResponse]) => {
        if (cancelled) return;
        setStores(storeResponse.items);
        setCategories(categoryResponse.items);
        setStoreId((current) => {
          if (current && storeResponse.items.some((store) => store.id === current)) return current;
          return storeResponse.items[0]?.id ?? "";
        });
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(apiErrorMessage(caught, "CartNest could not load product setup data."));
      });
    return () => { cancelled = true; };
  }, [access, canCreateProducts, canReadStores, vendorId]);

  useEffect(() => {
    if (combinations.length === 0) return;
    setVariantEditors((current) => Object.fromEntries(combinations.map((combination) => [
      combination.key,
      current[combination.key] ?? { sku: "", price: "" },
    ])));
  }, [combinations]);

  if (state === "loading") return <LoadingState label="Loading product creator…" />;
  if (state === "error" || !access) return <ErrorState title="Vendor workspace unavailable" message={error ?? "CartNest could not load this vendor."} action={<button className="secondaryButton" type="button" onClick={() => void reload()}>Try again</button>} />;
  if (!canReadStores || !canCreateProducts) return <ErrorState title="Product creation restricted" message="Creating products requires store:read and product:create permissions." />;
  if (loadError) return <ErrorState title="Product setup unavailable" message={loadError} />;

  function addOption() {
    const id = nextOptionId.current++;
    setOptions((current) => [...current, { id, name: "", valuesText: "" }]);
  }

  function updateOption(id: number, patch: Partial<Pick<OptionEditor, "name" | "valuesText">>) {
    setOptions((current) => current.map((option) => option.id === id ? { ...option, ...patch } : option));
  }

  function removeOption(id: number) {
    setOptions((current) => current.filter((option) => option.id !== id));
  }

  function updateVariant(key: string, patch: Partial<VariantEditor>) {
    setVariantEditors((current) => ({ ...current, [key]: { ...(current[key] ?? { sku: "", price: "" }), ...patch } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!storeId) {
      setMessage("Create or select a store before creating a product.");
      return;
    }
    const optionError = validateOptions(parsedOptions);
    if (optionError) {
      setMessage(optionError);
      return;
    }
    if (parsedOptions.length > 0 && combinations.length === 0) {
      setMessage("These option values create more than the current 250-variant limit. Reduce the combinations.");
      return;
    }
    if (!slug || slug.length < 2) {
      setMessage("Enter a product slug with at least two characters.");
      return;
    }

    const normalizedOptions = normalizeOptionDrafts(parsedOptions);
    const variantBodies: CreateProductBodyDto["variants"] = [];
    for (const combination of combinations) {
      const editor = variantEditors[combination.key];
      const sku = editor?.sku.trim() ?? "";
      const amountMinor = editor ? parseNairaToMinor(editor.price) : null;
      if (!sku) {
        setMessage(`Enter an SKU for ${combination.selections.map((item) => item.value).join(" / ") || "the standard variant"}.`);
        return;
      }
      if (!amountMinor) {
        setMessage(`Enter a valid NGN price for ${combination.selections.map((item) => item.value).join(" / ") || "the standard variant"}.`);
        return;
      }
      variantBodies.push({
        sku,
        price: { amountMinor, currency: "NGN" },
        optionSelections: combination.selections.map((selection) => ({ ...selection })),
      });
    }

    setBusy(true);
    try {
      const created = await catalogApi.createProduct(storeId, {
        ...(categoryId ? { categoryId } : {}),
        name: name.trim(),
        slug,
        description: description.trim(),
        options: normalizedOptions.map((option) => ({ name: option.name, values: [...option.values] })),
        variants: variantBodies,
      });
      router.push(`/vendor/${encodeURIComponent(vendorId)}/products/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setMessage(apiErrorMessage(caught, "CartNest could not create this product."));
      setBusy(false);
    }
  }

  return (
    <main className="pageShell">
      <VendorWorkspaceShell access={access}>
        <div className="workspacePageHeader">
          <div><p className="eyebrow">New product</p><h1 className="pageTitle">Create a product</h1><p className="muted">Define normalized options and every initial sellable variant before saving the draft.</p></div>
        </div>

        {stores.length === 0 ? <ErrorState title="A store is required" message="Create a store before adding products." /> : (
          <form className="productEditorStack" onSubmit={submit}>
            <section className="panel sellerForm">
              <div className="sectionHeadingCompact"><div><h2>Product information</h2><p>The product remains DRAFT until it satisfies publication rules.</p></div></div>
              <div className="formGrid formGridTwo">
                <label className="field">Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.status}</option>)}</select></label>
                <label className="field">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{labels.get(category.id) ?? category.name}</option>)}</select></label>
              </div>
              <div className="formGrid formGridTwo">
                <label className="field">Product name<input value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugTouched) setSlug(slugifyProduct(next)); }} minLength={2} maxLength={200} required /></label>
                <label className="field">Product slug<input value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugifyProduct(event.target.value)); }} minLength={2} maxLength={160} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
              </div>
              <label className="field">Description<textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} minLength={1} maxLength={20000} required /></label>
            </section>

            <section className="panel sellerForm">
              <div className="sectionHeadingCompact"><div><h2>Options</h2><p>Use options such as Color and Size. Product options are normalized database records, not free-form JSON.</p></div><button className="secondaryButton" type="button" onClick={addOption}>Add option</button></div>
              {options.length === 0 ? <p className="formMessage">No options. CartNest will create one standard variant.</p> : (
                <div className="optionEditorList">
                  {options.map((option, index) => (
                    <div className="optionEditorCard" key={option.id}>
                      <div className="optionEditorHeader"><strong>Option {index + 1}</strong><button className="textButton textButtonDanger" type="button" onClick={() => removeOption(option.id)}>Remove</button></div>
                      <div className="formGrid formGridTwo">
                        <label className="field">Name<input value={option.name} onChange={(event) => updateOption(option.id, { name: event.target.value })} maxLength={80} placeholder="Color" /></label>
                        <label className="field">Values<input value={option.valuesText} onChange={(event) => updateOption(option.id, { valuesText: event.target.value })} maxLength={1000} placeholder="Black, White, Blue" /><span className="fieldHint">Separate values with commas or new lines.</span></label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel sellerForm">
              <div className="sectionHeadingCompact"><div><h2>Variants</h2><p>{combinations.length > 0 ? `${combinations.length} variant combination${combinations.length === 1 ? "" : "s"}.` : "Variant limit exceeded or options are incomplete."} SKU uniqueness is scoped to the selected store.</p></div></div>
              {combinations.length > 0 ? (
                <div className="variantCreateTableWrap">
                  <table className="dataTable variantCreateTable">
                    <thead><tr><th>Variant</th><th>SKU</th><th>NGN price</th></tr></thead>
                    <tbody>
                      {combinations.map((combination) => (
                        <tr key={combination.key}>
                          <td>{combination.selections.length > 0 ? combination.selections.map((item) => `${item.optionName}: ${item.value}`).join(" · ") : "Standard"}</td>
                          <td><input aria-label={`SKU for ${combination.key}`} value={variantEditors[combination.key]?.sku ?? ""} onChange={(event) => updateVariant(combination.key, { sku: event.target.value })} maxLength={100} required /></td>
                          <td><input aria-label={`Price for ${combination.key}`} inputMode="decimal" value={variantEditors[combination.key]?.price ?? ""} onChange={(event) => updateVariant(combination.key, { price: event.target.value })} placeholder="0.00" required /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="formMessage formMessageError">Reduce the option combinations to 250 or fewer and ensure each option has at least one value.</p>}
            </section>

            {message ? <p className="formMessage formMessageError" role="alert">{message}</p> : null}
            <div className="editorSubmitBar"><button className="primaryButton" disabled={busy || combinations.length === 0}>{busy ? "Creating product…" : "Create product draft"}</button></div>
          </form>
        )}
      </VendorWorkspaceShell>
    </main>
  );
}
