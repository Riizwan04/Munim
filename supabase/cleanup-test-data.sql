-- Removes the throwaway data created while testing Munim (test businesses and test sign-ups).
-- Keeps the demo business "Sample Building Supplies" and every real business.
-- Run in the Supabase SQL Editor. Step 1 only LOOKS; step 2 deletes. Read step 1's output before running step 2.

-- STEP 1: preview
select 'business' as kind, id::text, name from businesses
 where name in ('Shop A', 'Shop B', 'Test Kirana', 'Import Test Shop')
union all
select 'user', id::text, email from auth.users
 where email like 'munim.test+%@example.com' or email like 'munim.onboard.%@example.com' or email like 'munim.import.%@example.com';

-- STEP 2: delete (uncomment the block below, then Run)
-- begin;
--   delete from businesses where name in ('Shop A', 'Shop B', 'Test Kirana', 'Import Test Shop');   -- cascades to their parties, entries, items, logs
--   delete from auth.users
--    where email like 'munim.test+%@example.com' or email like 'munim.onboard.%@example.com' or email like 'munim.import.%@example.com';
-- commit;
