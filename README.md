# Munim

Voice-first ledger and accountant for small businesses in India. First preset: building-material dealers. Hindi, Marathi and English.

**Golden rule:** the AI only understands; the app's code calculates. Every rupee is computed by tested code in whole paise.

## Layout

- `packages/ledger-core`: all the maths and logic (balances, rates, FIFO payments, statements, reports, spoken-number and name matching, page import). ~190 tests.
- `packages/db-tests`: tests that run against a real Supabase project (tenant isolation, edit history, audit log).
- `apps/dealer`: the Expo (React Native) app for Android, iPhone and web.
- `supabase/migrations`: the database (per-business row-level security). `supabase/functions`: optional AI functions (not deployed).
- `docs/DEPLOYMENT.md`: launch checklist, costs, what is still to build.
- `docs/PHONE-TEST.md`: how to test on a real iPhone and Android phone.

## Run it

```bash
npm install
cp .env.example apps/dealer/.env     # add your Supabase URL + publishable key
npm test                             # ledger tests (+ database tests if .env exists)
npm run seed                         # one-time demo business with sample data
cd apps/dealer && npx expo start     # scan the QR code with Expo Go, or press w for web
```

Demo login (sample data only): `demo.dealer@example.com` / `Munim-demo-2026`.

Web deploy: Vercel reads `vercel.json` (`npm run build:web`). Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the project settings.
