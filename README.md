# Munim

Voice-first AI accountant / credit ledger for small businesses. First preset: building-material dealers.

- `packages/ledger-core` – pure TypeScript ledger maths (paise, FIFO, rates, balances). **All money maths lives here, never in the AI.**
- `supabase/migrations` – Postgres schema with per-business row-level security.
- `apps/` – (next steps) dealer + party Expo apps.

```bash
npm install
npm test
```

## Run the dealer app (Expo)

```bash
npm install
cp .env.example apps/dealer/.env   # then fill in your Supabase URL + publishable key
npm run seed                       # one-time: demo business with sample data
cd apps/dealer && npx expo start   # scan the QR code with Expo Go
```

Demo login: `demo.dealer@example.com` / `Munim-demo-2026` (sample data only).
