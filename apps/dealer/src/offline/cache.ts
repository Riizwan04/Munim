import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError } from "@munim/ledger-core";

/**
 * Read cache: lists and ledgers are fetched fresh when online and kept on the phone; with no internet the last copy is
 * shown instead. Separate per signed-in user, and wiped on log out.
 */
let ns = "anon";
export const setCacheUser = (id: string | null) => { ns = id ?? "anon"; };
const key = (k: string) => `munim.cache.${ns}.${k}`;

export async function withCache<T>(k: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const v = await fetcher();
    AsyncStorage.setItem(key(k), JSON.stringify(v)).catch(() => undefined);
    return v;
  } catch (e) {
    if (classifyError(e) === "network") {
      const raw = await AsyncStorage.getItem(key(k)).catch(() => null);
      if (raw) { try { return JSON.parse(raw) as T; } catch { /* fall through to the error */ } }
    }
    throw e;
  }
}
export async function clearCache(userId: string) {
  const prefix = `munim.cache.${userId}.`;
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(prefix))).catch(() => undefined);
}
