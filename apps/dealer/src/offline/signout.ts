import { supabase } from "../supabase";
import { clearCache } from "./cache";
import { canSignOut } from "./outbox";

/** Log out, unless entries are still waiting to upload (then nothing is lost: it returns false and the app says why). */
export async function requestSignOut(): Promise<boolean> {
  if (!(await canSignOut())) return false;
  const { data } = await supabase.auth.getSession();
  if (data.session) await clearCache(data.session.user.id);
  await supabase.auth.signOut();
  return true;
}
