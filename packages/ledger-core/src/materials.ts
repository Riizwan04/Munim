/**
 * Matching spoken item names to the shop's items.
 * - Brands are separate items under a category (Cement → Waddi / JSW / Super).
 *   Saying just "cement" is ambiguous → the assistant must ask which brand.
 * - An item can be sold in several units (sand: butti / mtr) with a DIFFERENT
 *   rate per unit. There is NO conversion between units: the rate on each
 *   line applies to the unit stated on that line.
 */
export interface MaterialRef {
  id: string;
  name: string; // "Waddi"
  category?: string | null; // "Cement"
  localNames: string[];
  units: string[]; // allowed units, e.g. ["butti", "mtr"]
  /** Said out loud but not in the list yet: it is created when the owner taps Save. */
  isNew?: boolean;
}

export type MaterialMatch =
  | { kind: "match"; material: MaterialRef }
  | { kind: "ambiguous"; options: MaterialRef[]; reason: "brand" | "name" }
  | { kind: "none" };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Resolve a spoken term. Exact item/local name wins; a bare category with >1 brand is ambiguous. */
export function matchMaterial(term: string, materials: MaterialRef[]): MaterialMatch {
  const t = norm(term);
  if (!t) return { kind: "none" };
  const exact = materials.filter((m) => [m.name, ...m.localNames].some((n) => norm(n) === t));
  if (exact.length === 1) return { kind: "match", material: exact[0]! };
  if (exact.length > 1) return { kind: "ambiguous", options: exact, reason: "name" };
  const inCategory = materials.filter((m) => m.category && norm(m.category) === t);
  if (inCategory.length === 1) return { kind: "match", material: inCategory[0]! };
  if (inCategory.length > 1) return { kind: "ambiguous", options: inCategory, reason: "brand" };
  // "jsw cement" style: all words appear in name + category
  const words = t.split(" ");
  const loose = materials.filter((m) => {
    const hay = norm(`${m.name} ${m.category ?? ""} ${m.localNames.join(" ")}`);
    return words.every((w) => hay.includes(w));
  });
  if (loose.length === 1) return { kind: "match", material: loose[0]! };
  if (loose.length > 1) return { kind: "ambiguous", options: loose, reason: "name" };
  return { kind: "none" };
}

/** Unit must be one the item is sold in (e.g. sand: butti or mtr, not bag). */
export function validUnit(material: MaterialRef, unit: string): boolean {
  return material.units.some((u) => norm(u) === norm(unit));
}

/** Units offered for an item the shop has never sold before, until the owner says which one. */
export const NEW_ITEM_UNITS = ["bag", "nos", "kg", "mtr", "ltr", "butti", "brass", "trolley", "ton"];

/** "Acc cement" → "ACC cement" for short all-letter words; Devanagari is left exactly as heard. */
export function prettyItemName(words: string[]): string {
  // letters said as initials stay in capitals: TMT, PVC, JSW, ACC
  const w = words.map((x) => (/^[a-z]{2,5}$/.test(x) && (!/[aeiou]/.test(x) || ["acc", "opc", "ppc", "ibr", "ptp", "gi", "ms", "pp", "gp"].includes(x)) ? x.toUpperCase() : x));
  const joined = w.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
