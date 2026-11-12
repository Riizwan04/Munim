import { groupIndian } from "@munim/ledger-core";
/** paise → "1,53,300" (rounded to rupee). */
export const rs = (paise: number) => {
  const r = Math.round(Math.abs(paise) / 100);
  return (paise < 0 ? "-" : "") + groupIndian(r);
};
export const rupee = (paise: number) => "₹" + rs(paise);
