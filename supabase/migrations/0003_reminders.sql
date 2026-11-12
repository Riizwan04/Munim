-- Step 8: manual payment reminders. This table is only a LOG of reminders the dealer chose to send
-- (so the app can show "last reminded"). Nothing here sends anything or runs on a schedule.
create table reminders (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  party_id    uuid not null references parties(id) on delete cascade,
  amount      bigint not null,                        -- balance (paise) at the time of the reminder
  channel     text not null default 'whatsapp',
  message     text,
  created_by  uuid default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on reminders (business_id, party_id, created_at desc);

alter table reminders enable row level security;
create policy staff_read   on reminders for select using (is_member(business_id));
create policy staff_insert on reminders for insert with check (is_member(business_id));
-- append-only log: no update/delete policies
revoke update, delete on reminders from authenticated;
