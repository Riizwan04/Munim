# Munim

Voice-first AI accountant / credit ledger for small businesses. First preset: building-material dealers.

- `packages/ledger-core` – pure TypeScript ledger maths (paise, FIFO, rates, balances). **All money maths lives here, never in the AI.**
- `supabase/migrations` – Postgres schema with per-business row-level security.
- `apps/` – (next steps) dealer + party Expo apps.

```bash
npm install
npm test
```
