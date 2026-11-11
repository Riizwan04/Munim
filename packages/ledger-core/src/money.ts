/**
 * Money & quantity primitives.
 * BR-6: all amounts are integer paise. Quantities are integer milli-units
 * (1.5 brass = 1500) so no floating point ever touches the books.
 */
export type Paise = number;
export type MilliQty = number;

export function assertInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a safe integer, got ${n}`);
}

/** Integer division rounding half away from zero. */
export function divRound(num: number, den: number): number {
  if (den === 0) throw new Error("division by zero");
  const sign = Math.sign(num) * Math.sign(den);
  const n = Math.abs(num);
  const d = Math.abs(den);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

export function rupeesToPaise(rupees: number): Paise {
  return divRound(Math.round(rupees * 1000), 10);
}

export function toMilliQty(qty: number): MilliQty {
  return Math.round(qty * 1000);
}

/** Round paise to the nearest whole rupee (display only, BR-6). */
export function roundToRupee(p: Paise): Paise {
  return divRound(p, 100) * 100;
}

/** Indian digit grouping: 12345678 -> "1,23,45,678". */
export function groupIndian(n: number): string {
  const s = String(Math.abs(n));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** "₹1,53,300" (rounded to rupee). Negative shown with leading "-". */
export function formatINR(p: Paise): string {
  const r = divRound(p, 100);
  return `${r < 0 ? "-" : ""}₹${groupIndian(r)}`;
}
