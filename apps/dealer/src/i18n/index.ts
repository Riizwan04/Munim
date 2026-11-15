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
let asstNameNow = "";
/** Every business names its own assistant: in the assistant's own phrases ("Talk to Munim") the name is swapped in. */
export const setAssistantNameNow = (n: string) => { asstNameNow = n.trim(); };
const ASSISTANT_KEYS = /^(talk|v|q|a|c|hf)\./;
export const translate = (lang: Lang, key: Key, vars?: Vars) => {
  const s = fill(DICT[lang][key] ?? en[key] ?? key, vars);
  return asstNameNow && ASSISTANT_KEYS.test(key) ? s.replace(/Munim|मुनीम/g, asstNameNow) : s;
};
let uiNow: Lang = "en";
/** For code outside components (error messages). Follows the app language setting. */
export const translateNow = (key: Key, vars?: Vars) => translate(uiNow, key, vars);

interface Ctx { ui: Lang; asst: Lang; setUi: (l: Lang) => void; setAsst: (l: Lang) => void; asstChosen: boolean | undefined; chooseAsst: (l: Lang) => void }
const I18n = createContext<Ctx>({ ui: "en", asst: "en", setUi: () => {}, setAsst: () => {}, asstChosen: true, chooseAsst: () => {} });
const K_UI = "munim.uiLang", K_ASST = "munim.asstLang", K_CHOSEN = "munim.asstChosen";
const valid = (x: unknown): x is Lang => x === "en" || x === "hi" || x === "mr";

/** App language (screens) and assistant language (questions, read-back) are separate, and both default to English. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [ui, setUiState] = useState<Lang>("en");
  const [asst, setAsstState] = useState<Lang>("en");
  const [asstChosen, setChosen] = useState<boolean | undefined>(undefined); // undefined = still reading the phone's settings
  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([AsyncStorage.getItem(K_UI), AsyncStorage.getItem(K_ASST)]);
        if (valid(a)) setUiState(a);
        if (valid(b)) setAsstState(b);
        setChosen(valid(b) || (await AsyncStorage.getItem(K_CHOSEN)) === "1"); // phones that already picked a language are not asked again
      } catch { setChosen(true); /* storage unavailable: stay on English, do not nag */ }
    })();
  }, []);
  const setUi = useCallback((l: Lang) => { setUiState(l); AsyncStorage.setItem(K_UI, l).catch(() => {}); }, []);
  const setAsst = useCallback((l: Lang) => { setAsstState(l); AsyncStorage.setItem(K_ASST, l).catch(() => {}); }, []);
  /** First open: the owner picks the language Munim speaks, once. After that it only changes in Settings. */
  const chooseAsst = useCallback((l: Lang) => { setAsst(l); setChosen(true); AsyncStorage.setItem(K_CHOSEN, "1").catch(() => {}); }, [setAsst]);
  uiNow = ui;
  const value = useMemo(() => ({ ui, asst, setUi, setAsst, asstChosen, chooseAsst }), [ui, asst, setUi, setAsst, asstChosen, chooseAsst]);
  return createElement(I18n.Provider, { value }, children);
}

export function useI18n() {
  const { ui, asst, setUi, setAsst, asstChosen, chooseAsst } = useContext(I18n);
  return {
    ui, asst, setUi, setAsst, asstChosen, chooseAsst,
    /** screen text, in the app language */
    tr: (key: Key, vars?: Vars) => translate(ui, key, vars),
    /** screen text with singular/plural: uses key_one when n === 1, else key_other */
    trn: (key: string, n: number, vars?: Vars) => translate(ui, `${key}_${n === 1 ? "one" : "other"}` as Key, { n, ...vars }),
    /** the assistant's written words (questions, read-back). Always English on screen; the assistant language is for what Munim SPEAKS. */
    ta: (key: Key, vars?: Vars) => translate("en", key, vars),
  };
}
