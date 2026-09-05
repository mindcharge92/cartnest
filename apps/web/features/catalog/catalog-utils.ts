import type { CategoryDto, MoneyDto, ProductVariantDto } from "@repo/contracts";

export interface ProductOptionDraft {
  readonly name: string;
  readonly values: readonly string[];
}

export interface VariantCombination {
  readonly key: string;
  readonly selections: readonly { optionName: string; value: string }[];
}

const integerFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export function formatMoney(money: MoneyDto): string {
  const minor = BigInt(money.amountMinor);
  const major = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, "0");
  const prefix = money.currency === "NGN" ? "₦" : `${money.currency} `;
  return `${prefix}${integerFormatter.format(major)}.${fraction}`;
}

export function parseNairaToMinor(value: string): string | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0")).toString();
}

export function minorToNairaInput(amountMinor: string): string {
  const minor = BigInt(amountMinor);
  const whole = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function slugifyProduct(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 160);
}

export function normalizeOptionDrafts(options: readonly ProductOptionDraft[]): ProductOptionDraft[] {
  return options
    .map((option) => ({
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((option) => option.name.length > 0 && option.values.length > 0);
}

export function buildVariantCombinations(options: readonly ProductOptionDraft[]): VariantCombination[] {
  const normalized = normalizeOptionDrafts(options);
  if (normalized.length === 0) return [{ key: "default", selections: [] }];

  let combinations: Array<Array<{ optionName: string; value: string }>> = [[]];
  for (const option of normalized) {
    combinations = combinations.flatMap((existing) =>
      option.values.map((value) => [...existing, { optionName: option.name, value }]),
    );
    if (combinations.length > 250) return [];
  }

  return combinations.map((selections) => ({
    key: selections.map((selection) => `${selection.optionName}=${selection.value}`).join("|"),
    selections,
  }));
}

export function variantSelection(variant: ProductVariantDto): Record<string, string> {
  return Object.fromEntries(
    variant.optionValues.map((selection) => [selection.optionId, selection.valueId]),
  );
}

export function variantMatchesSelection(
  variant: ProductVariantDto,
  selected: Readonly<Record<string, string>>,
): boolean {
  const selectedEntries = Object.entries(selected).filter(([, value]) => Boolean(value));
  if (selectedEntries.length === 0) return variant.optionValues.length === 0;
  return variant.optionValues.length === selectedEntries.length &&
    variant.optionValues.every((selection) => selected[selection.optionId] === selection.valueId);
}

export function bestVariantForOptionValue(
  variants: readonly ProductVariantDto[],
  optionId: string,
  valueId: string,
  selected: Readonly<Record<string, string>>,
): ProductVariantDto | null {
  let best: { variant: ProductVariantDto; score: number } | null = null;

  for (const variant of variants) {
    const containsValue = variant.optionValues.some(
      (selection) => selection.optionId === optionId && selection.valueId === valueId,
    );
    if (!containsValue) continue;

    const score = variant.optionValues.reduce((matches, selection) => {
      if (selection.optionId === optionId) return matches;
      return selected[selection.optionId] === selection.valueId ? matches + 1 : matches;
    }, 0);

    if (!best || score > best.score) best = { variant, score };
  }

  return best?.variant ?? null;
}

export function categoryLabels(categories: readonly CategoryDto[]): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const cache = new Map<string, string>();

  function labelFor(category: CategoryDto, seen: Set<string>): string {
    const cached = cache.get(category.id);
    if (cached) return cached;
    if (!category.parentId || seen.has(category.parentId)) {
      cache.set(category.id, category.name);
      return category.name;
    }
    const parent = byId.get(category.parentId);
    if (!parent) {
      cache.set(category.id, category.name);
      return category.name;
    }
    const nextSeen = new Set(seen).add(category.id);
    const label = `${labelFor(parent, nextSeen)} / ${category.name}`;
    cache.set(category.id, label);
    return label;
  }

  for (const category of categories) labelFor(category, new Set());
  return cache;
}

export function shortDescription(value: string, maxLength = 150): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
