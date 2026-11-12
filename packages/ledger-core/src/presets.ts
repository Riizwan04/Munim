/**
 * Business-type presets: starter items, all editable in the app. Building material is the first preset (PRD 1.4);
 * nothing in the app is hard-coded to it — items, units and categories are data.
 */
export interface PresetItem { name: string; category: string; units: string[]; localNames?: string[] }
export interface Preset { key: string; label: string; items: PresetItem[] }

export const PRESETS: Preset[] = [
  {
    key: "building_material", label: "Building material (cement, sand, bricks...)",
    items: [
      { name: "Cement", category: "Cement", units: ["bag"], localNames: ["simenta"] },
      { name: "Sand", category: "Sand", units: ["butti", "mtr", "brass"], localNames: ["reti", "vaalu", "ret"] },
      { name: "Khadi", category: "Khadi", units: ["butti", "mtr", "brass"], localNames: ["gitti", "jelly", "metal"] },
      { name: "Red Brick", category: "Bricks", units: ["nos"], localNames: ["eent"] },
      { name: "Block 4 inch", category: "Blocks", units: ["nos"] },
      { name: "Block 6 inch", category: "Blocks", units: ["nos"] },
      { name: "Waterproofing Liquid", category: "Waterproofing", units: ["ltr"] },
      { name: "Waterproofing Powder", category: "Waterproofing", units: ["kg"] },
    ],
  },
  { key: "general", label: "General shop / other business (add my own items)", items: [] },
];
export const getPreset = (key: string) => PRESETS.find((p) => p.key === key);

/** Units offered as one-tap chips when adding an item. */
export const COMMON_UNITS = ["bag", "nos", "kg", "ltr", "butti", "mtr", "brass", "trolley", "ton", "box", "pkt", "dozen"];
