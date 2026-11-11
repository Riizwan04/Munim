-- Munim: core schema. Multi-business from day one (business_id on every row),
-- amounts in integer paise, quantities in integer milli-units, RLS everywhere.

create extension if not exists pgcrypto;

-- ───────── enums ─────────
create type member_role   as enum ('owner', 'manager');
create type entry_type    as enum ('sale', 'payment', 'charge', 'discount', 'return');
create type entry_status  as enum ('active', 'edited', 'cancelled');
create type payment_mode  as enum ('cash', 'upi', 'cheque', 'bank');
create type notify_tier   as enum ('app', 'link');
create type notify_pref   as enum ('instant', 'daily_digest');
create type lang          as enum ('hi', 'mr', 'en');

-- ───────── tenancy ─────────
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_phone   text not null,
  language      lang not null default 'hi',
  business_type text not null default 'building_material', -- preset key; items/units are data, not code
  gst_enabled   boolean not null default false,
  created_at    timestamptz not null default now()
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null,
  role        member_role not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- ───────── masters ─────────
create table parties (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  name               text not null,
  nicknames          text[] not null default '{}',
  phone              text not null,
  party_type         text not null default 'contractor', -- configurable label (contractor/retailer/...)
  credit_limit       bigint check (credit_limit is null or credit_limit >= 0),
  opening_balance    bigint not null default 0,
  preferred_language lang not null default 'hi',
  notify_tier        notify_tier not null default 'link',
  notify_pref        notify_pref not null default 'instant',
  user_id            uuid references auth.users(id), -- set when the party logs into the Party app
  created_at         timestamptz not null default now()
);
create index on parties (business_id);
create index on parties (phone);

create table sites (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  party_id    uuid not null references parties(id) on delete cascade,
  name        text not null,
  location    text,
  is_default  boolean not null default false,
  status      text not null default 'active' check (status in ('active', 'closed'))
);
create index on sites (party_id);

create table materials (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,                 -- e.g. 'Waddi', 'JSW', 'Super', '6 inch block'
  category     text,                          -- e.g. 'Cement', 'Sand', 'Khadi', 'Blocks', 'Waterproofing'
  local_names  text[] not null default '{}',
  units        text[] not null check (cardinality(units) > 0), -- units it is sold in, e.g. {butti,mtr}; each unit has its own rate, NO conversion; each entry line stores its own unit
  gst_bp       integer check (gst_bp is null or gst_bp between 0 and 10000), -- 5% = 500
  created_at   timestamptz not null default now()
);
create index on materials (business_id);

-- OPTIONAL reference price list (informational only). The shop's real rule: every
-- entry states its own rate, and it differs per customer. The suggestion shown to the
-- dealer is the party's last rate (derived from entry_lines), not these tables.
create table material_rates (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  material_id    uuid not null references materials(id) on delete cascade,
  rate           bigint not null check (rate >= 0), -- paise per unit
  effective_from date not null default current_date
);
create table party_rates (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  party_id       uuid not null references parties(id) on delete cascade,
  material_id    uuid not null references materials(id) on delete cascade,
  rate           bigint not null check (rate >= 0),
  effective_from date not null default current_date
);

-- ───────── ledger ─────────
-- Edits never overwrite: an edit inserts a new row (version+1) and marks the old one 'edited'.
create table entries (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  entry_group   uuid not null default gen_random_uuid(), -- same across versions of one logical entry
  version       integer not null default 1,
  party_id      uuid not null references parties(id),
  site_id       uuid references sites(id),
  type          entry_type not null,
  entry_date    date not null default current_date,
  amount        bigint not null check (amount >= 0), -- final total in paise, computed by app code
  payment_mode  payment_mode,
  cheque_bounced boolean not null default false,
  source        text not null default 'manual' check (source in ('voice', 'manual')),
  transcript    text,
  audio_url     text,
  status        entry_status not null default 'active',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (entry_group, version)
);
create index on entries (business_id, party_id, entry_date);

create table entry_lines (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entry_id    uuid not null references entries(id) on delete cascade,
  material_id uuid not null references materials(id),
  quantity    bigint not null check (quantity > 0), -- milli-units
  unit        text not null,
  rate        bigint not null check (rate >= 0),    -- paise
  gst_bp      integer,
  line_total  bigint not null                       -- paise, computed by app code
);
create index on entry_lines (entry_id);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entry_id    uuid references entries(id),
  action      text not null check (action in ('create', 'edit', 'cancel', 'cheque_bounced')),
  old_value   jsonb,
  new_value   jsonb,
  user_id     uuid references auth.users(id),
  reason      text,
  created_at  timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  party_id    uuid not null references parties(id) on delete cascade,
  entry_id    uuid references entries(id),
  channel     text not null check (channel in ('push', 'sms', 'whatsapp')),
  template    text not null check (template in ('entry', 'edit', 'reminder', 'digest')),
  status      text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ───────── RLS helpers ─────────
create function is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members m where m.business_id = b and m.user_id = auth.uid());
$$;

create function is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members m
                 where m.business_id = b and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- The logged-in Party-app user's party ids (they only ever see their own).
create function my_party_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from parties where user_id = auth.uid();
$$;

-- ───────── RLS ─────────
alter table businesses       enable row level security;
alter table business_members enable row level security;
alter table parties          enable row level security;
alter table sites            enable row level security;
alter table materials        enable row level security;
alter table material_rates   enable row level security;
alter table party_rates      enable row level security;
alter table entries          enable row level security;
alter table entry_lines      enable row level security;
alter table audit_log        enable row level security;
alter table notifications    enable row level security;

create policy biz_read   on businesses for select using (is_member(id));
create policy biz_update on businesses for update using (is_owner(id));
create policy biz_insert on businesses for insert with check (auth.uid() is not null);

create policy mem_read   on business_members for select using (is_member(business_id) or user_id = auth.uid());
create policy mem_write  on business_members for all using (is_owner(business_id)) with check (is_owner(business_id));

-- Staff (owner/manager): full access inside their business.
create policy staff_all on parties        for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on sites          for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on materials      for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on material_rates for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on party_rates    for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on entries        for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on entry_lines    for all using (is_member(business_id)) with check (is_member(business_id));
create policy staff_all on notifications  for all using (is_member(business_id)) with check (is_member(business_id));
-- Audit log is append-only: read + insert, no update/delete policy.
create policy audit_read   on audit_log for select using (is_member(business_id));
create policy audit_insert on audit_log for insert with check (is_member(business_id));

-- Party app: read-only, own data only.
create policy party_self_party on parties     for select using (id in (select my_party_ids()));
create policy party_self_sites on sites       for select using (party_id in (select my_party_ids()));
create policy party_self_entry on entries     for select using (party_id in (select my_party_ids()));
create policy party_self_lines on entry_lines for select using (
  entry_id in (select id from entries where party_id in (select my_party_ids())));
-- Party may read business name/phone only through their own entries' business.
create policy party_self_biz on businesses for select using (
  id in (select business_id from parties where id in (select my_party_ids())));

-- Entries are never hard-deleted (BR-7).
revoke delete on entries, entry_lines, audit_log from authenticated;
