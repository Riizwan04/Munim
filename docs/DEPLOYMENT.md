# Munim: deployment and launch checklist

Three parts, three places:

| Part | Where | Today |
|---|---|---|
| Backend (database, login, security rules) | Supabase | Live, used for development |
| Web app (for checking while we build) | Vercel (`munim-coral.vercel.app`) | Live, rebuilds on every push |
| Phone app (Android + iPhone) | Google Play / Apple App Store, built with Expo EAS | Not yet |

## 1. Before real shop data goes in

- [ ] **Separate production Supabase project.** The current project holds test data. Create a new one (region: Mumbai, `ap-south-1`) for the real books.
- [ ] Run the migrations **in order** in the SQL Editor: `0001_init.sql`, `0002_entry_functions.sql`, `0003_reminders.sql`.
- [ ] Authentication → Sign In / Providers: Email enabled. For real use turn **Confirm email ON** (needs a real sender; Supabase's built-in mail is limited to a few emails per hour, so add an SMTP provider) or switch to phone OTP (below).
- [ ] Authentication → Rate limits and Attack protection: leave defaults on; consider turning on CAPTCHA.
- [ ] **Backups:** the free plan has no automatic backups and pauses after about 7 days without use. Upgrade to **Pro (~$25/month)** before real use (daily backups, no pausing). Until then use Reports → "All entries (CSV backup)" weekly.
- [ ] Vercel → Environment Variables: point `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` at the production project (public-safe values only). Redeploy.
- [ ] Turn on **2FA** for GitHub, Vercel and Supabase accounts.
- [ ] Never put the `service_role` key or the database password in the app, in Vercel, or in chat.

## 2. Things that cost money (the "paid, later" list)

| Item | Why | Rough cost |
|---|---|---|
| Supabase Pro | Backups, no pausing | ~$25/month |
| Phone OTP login | Passwordless login for dealers and customers (PRD FR-01). India needs **DLT registration** of the sender and message template; local providers (e.g. MSG91) are cheaper than Twilio | SMS per message + one-time DLT setup |
| AI extraction (`understand` function) | Free-form speech understanding | Pay per use (cents) |
| AI page scanner (`scan-ledger` function) | Auto-read photos of handwritten pages | Pay per page (a few cents) |
| Speech-to-text / text-to-speech | In-app mic and spoken replies (Sarvam, Google, Bhashini) | Pay per minute |
| Google Play developer account | Publish on Android | $25 once |
| Apple Developer Program | Publish on iPhone | $99/year |
| WhatsApp Business API | Automatic messages (not needed now: the app opens WhatsApp and the dealer taps send) | Per message |

## 3. Switching on the AI features (optional, when you decide)

1. Get an Anthropic API key at console.anthropic.com (keep it private).
2. Supabase → Edge Functions → Secrets: add `ANTHROPIC_API_KEY`.
3. Deploy the two functions in `supabase/functions/` (`understand`, `scan-ledger`) with the Supabase CLI or dashboard.
4. In Vercel set `EXPO_PUBLIC_UNDERSTAND_FUNCTION=1` and/or `EXPO_PUBLIC_SCAN_FUNCTION=1`, redeploy.
5. Test with a few real sentences/pages. These functions were written but never run, so expect small fixes.

## 4. Publishing the phone apps

- [ ] Create Expo + Google Play (+ Apple) developer accounts.
- [ ] Choose the final app name and bundle id (now `app.munim.dealer`; changing it later is hard).
- [ ] Build with EAS: Android `.aab` for Play, `.apk` for direct install to your father's phone; iOS build via TestFlight first.
- [ ] Store listing: name, description (Hindi / Marathi / English), screenshots, icon, category (Business / Finance).
- [ ] **Privacy policy page** (required by both stores): what is collected (phone/email, party names and numbers, ledger entries), why, that nothing is sold or shared, how to delete data. India's **DPDP Act** applies.
- [ ] Data-safety / privacy forms in each console.
- [ ] A way for a user to **delete their account and data**.

## 5. Test plan before handing it to your father

- [ ] Real Android phone and your iPhone (not only the browser): login, add entry, voice dictation, WhatsApp send, PDF, CSV.
- [ ] Hindi, Marathi and English screens read by a native speaker.
- [ ] Import 2-3 real handwritten pages; check totals match the written balances.
- [ ] Weak-network test: a slow connection and airplane mode (offline entry saving works; see `docs/PHONE-TEST.md`).
- [ ] Keep the paper khata in parallel for the first two weeks.

## 6. Known gaps (not built yet)

- Customer app with push alerts (a statement link with a 4-digit code exists; PRD F9 asks for OTP).
- Phone-number OTP login (PRD FR-01).
- In-app microphone, spoken replies.
- Unit conversion (1 brass = 100 cu ft); UPI pay links; automatic reminders (manual reminders exist).
- Report text and CSV headers are English only.
