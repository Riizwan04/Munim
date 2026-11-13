import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Key } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

export type Lang = "en" | "hi" | "mr";
export const LANGS: { k: Lang; label: string }[] = [{ k: "en", label: "English" }, { k: "hi", label: "हिन्दी" }, { k: "mr", label: "मराठी" }];
const DICT: Record<Lang, Record<Key, string>> = { en, hi, mr };
export type { Key };

type Vars = Record<string, string | number>;
const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`)) : s);
export const translate = (lang: Lang, key: Key, vars?: Vars) => fill(DICT[lang][key] ?? en[key] ?? key, vars);

interface Ctx { ui: Lang; asst: Lang; setUi: (l: Lang) => void; setAsst: (l: Lang) => void }
const I18n = createContext<Ctx>({ ui: "en", asst: "en", setUi: () => {}, setAsst: () => {} });
const K_UI = "munim.uiLang", K_ASST = "munim.asstLang";
const valid = (x: unknown): x is Lang => x === "en" || x === "hi" || x === "mr";

/** App language (screens) and assistant language (questions, read-back) are separate, and both default to English. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [ui, setUiState] = useState<Lang>("en");
  const [asst, setAsstState] = useState<Lang>("en");
  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([AsyncStorage.getItem(K_UI), AsyncStorage.getItem(K_ASST)]);
        if (valid(a)) setUiState(a);
        if (valid(b)) setAsstState(b);
      } catch { /* storage unavailable: stay on English */ }
    })();
  }, []);
  const setUi = useCallback((l: Lang) => { setUiState(l); AsyncStorage.setItem(K_UI, l).catch(() => {}); }, []);
  const setAsst = useCallback((l: Lang) => { setAsstState(l); AsyncStorage.setItem(K_ASST, l).catch(() => {}); }, []);
  const value = useMemo(() => ({ ui, asst, setUi, setAsst }), [ui, asst, setUi, setAsst]);
  return createElement(I18n.Provider, { value }, children);
}

export function useI18n() {
  const { ui, asst, setUi, setAsst } = useContext(I18n);
  return {
    ui, asst, setUi, setAsst,
    /** screen text, in the app language */
    tr: (key: Key, vars?: Vars) => translate(ui, key, vars),
    /** screen text with singular/plural: uses key_one when n === 1, else key_other */
    trn: (key: string, n: number, vars?: Vars) => translate(ui, `${key}_${n === 1 ? "one" : "other"}` as Key, { n, ...vars }),
    /** the assistant's own words (questions, read-back), in the assistant language */
    ta: (key: Key, vars?: Vars) => translate(asst, key, vars),
  };
}
