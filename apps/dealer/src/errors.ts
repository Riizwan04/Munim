import { classifyError } from "@munim/ledger-core";
import { translateNow } from "./i18n";

/** Error text for people: a dead connection says so plainly instead of "TypeError: Failed to fetch". */
export function fe(e: unknown): string {
  if (classifyError(e) === "network") return translateNow("offline.needsInternet");
  return (e as { message?: string })?.message ?? String(e);
}
