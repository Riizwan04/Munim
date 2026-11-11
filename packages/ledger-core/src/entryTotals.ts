import { divRound, assertInt, type Paise } from "./money.js";
import type { EntryLine } from "./types.js";

/** FR-32 / BR-10: line = qty × rate (× (1+GST%) when GST on). Rounded once, to paise. */
export function lineTotal(line: EntryLine): Paise {
  assertInt(line.quantity, "quantity");
  assertInt(line.rate, "rate");
  const base = divRound(line.quantity * line.rate, 1000);
  if (!line.gstBp) return base;
  return divRound(line.quantity * line.rate * (10000 + line.gstBp), 1000 * 10000);
}

export interface EntryTotalInput {
  lines?: EntryLine[];
  charges?: Paise[]; // transport/other, added
  discount?: Paise; // subtracted
}

export interface EntryTotal {
  linesTotal: Paise;
  chargesTotal: Paise;
  discount: Paise;
  total: Paise;
}

/** FR-32: entry total = sum of lines + charges − discount. */
export function entryTotal(input: EntryTotalInput): EntryTotal {
  const linesTotal = (input.lines ?? []).reduce((s, l) => s + lineTotal(l), 0);
  const chargesTotal = (input.charges ?? []).reduce((s, c) => {
    assertInt(c, "charge");
    return s + c;
  }, 0);
  const discount = input.discount ?? 0;
  assertInt(discount, "discount");
  return { linesTotal, chargesTotal, discount, total: linesTotal + chargesTotal - discount };
}
