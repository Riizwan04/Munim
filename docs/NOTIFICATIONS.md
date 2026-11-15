# Step 18 — customer notifications (free web push)

Customers who open their statement link can tap **Get a notification for every entry**. From then on their phone is told whenever the
shop saves, corrects or cancels an entry for them. Customers who never turn it on are not affected; they only see their statement when the shop sends the link.
No app store, no SMS, no cost.

## One-time setup (5 things)

1. **Database.** Supabase → SQL Editor → run `supabase/migrations/0007_push_subscriptions.sql`.
2. **Keys.** A VAPID key pair was generated for you (public + private). The *private* key is a secret: never commit it.
   - Supabase → Edge Functions → **Secrets** → add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
3. **Function.** Supabase → Edge Functions → **Deploy a new function** → name it exactly `notify-entry` → paste `supabase/functions/notify-entry/index.ts` → Deploy.
   Turn "Verify JWT with legacy secret" **off** (newer Supabase projects sign logins differently, so the legacy check would reject them). The function checks the signed-in shop owner itself.
4. **App key.** Vercel → the project → Settings → Environment Variables → add `EXPO_PUBLIC_VAPID_PUBLIC_KEY` = the **public** key → redeploy.
5. **Test.** In the app open a party → Statement → send/copy the link → open it on a phone, enter the 4-digit code, tap the bell button, allow notifications.
   Then add an entry for that party from the shop phone: the customer phone buzzes.

## How it works

- The customer page asks the browser for a private "push address" and stores it with `subscribe_push` (needs the link and the 4-digit code; same lock-out rules as the statement).
- After a save/edit/cancel the shop app builds the message text with ledger-core (`entryNotice`: every number comes from code) and calls `notify-entry`.
- `notify-entry` checks the caller is a signed-in shop owner for that customer, then sends the message to that customer's phones only.
- Revoking a statement link stops that customer's notifications. A phone that uninstalled/blocked notifications is removed automatically.
- Turning notifications on extends that link to a year so a key customer is not cut off after 30 days.

## iPhone note
Apple only allows web notifications for an app added to the Home Screen (iOS 16.4+). The page shows these steps when needed: Share → Add to Home Screen → open it from the home screen → tap the bell.
The home-screen icon is named after the shop and opens that customer's own statement.

## Limits
- Free: web push has no per-message cost. Supabase free plan allows plenty of function calls for a shop's volume.
- Notifications are not guaranteed instant on every phone (battery saver can delay them). WhatsApp via the paid API remains an option later.
