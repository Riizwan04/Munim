-- Step 2: all ledger writes go through these functions (atomic: entry + lines + audit together).
-- Direct INSERT/UPDATE on ledger tables is revoked from app users, so nothing can skip the audit log.
-- The server re-checks every line total with the same integer rounding the app uses (BR-6, FR-32).

revoke insert, update, delete on entries, entry_lines, audit_log from authenticated;
-- keep reads (select policies already exist)

-- Create a business and make the caller its owner.
create function create_business(p_name text, p_phone text, p_language lang default 'hi', p_type text default 'building_material')
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into businesses (name, owner_phone, language, business_type) values (p_name, p_phone, p_language, p_type) returning id into b;
  insert into business_members (business_id, user_id, name, phone, role) values (b, auth.uid(), p_name, p_phone, 'owner');
  return b;
end $$;

-- Internal: validate + insert one entry version. p = jsonb payload.
create function _write_entry(p jsonb, p_group uuid, p_version int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b uuid := (p->>'business_id')::uuid;
  e uuid; l jsonb; computed bigint; sum_lines bigint := 0; amt bigint := (p->>'amount')::bigint;
  t entry_type := (p->>'type')::entry_type;
begin
  if not is_member(b) then raise exception 'not a member of this business'; end if;
  if not exists (select 1 from parties where id = (p->>'party_id')::uuid and business_id = b) then
    raise exception 'party does not belong to this business'; end if;
  if p->>'site_id' is not null and not exists (
      select 1 from sites where id = (p->>'site_id')::uuid and business_id = b and party_id = (p->>'party_id')::uuid) then
    raise exception 'site does not belong to this party'; end if;

  for l in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    if not exists (select 1 from materials where id = (l->>'material_id')::uuid and business_id = b) then
      raise exception 'material does not belong to this business'; end if;
    if not ((l->>'unit') = any (select unnest(units) from materials where id = (l->>'material_id')::uuid)) then
      raise exception 'unit % not allowed for this material', l->>'unit'; end if;
    computed := round(((l->>'quantity')::numeric * (l->>'rate')::numeric * (10000 + coalesce((l->>'gst_bp')::int, 0))) / 10000000);
    if computed <> (l->>'line_total')::bigint then
      raise exception 'line total mismatch: expected %, got %', computed, l->>'line_total'; end if;
    sum_lines := sum_lines + computed;
  end loop;

  if t in ('sale', 'return') then
    if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception '% needs at least one line', t; end if;
    if sum_lines <> amt then raise exception 'entry total mismatch: expected %, got %', sum_lines, amt; end if;
  elsif jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) > 0 then
    raise exception '% entries cannot have lines', t;
  end if;
  if t = 'payment' and p->>'payment_mode' is null then raise exception 'payment needs a mode'; end if;

  insert into entries (business_id, entry_group, version, party_id, site_id, type, entry_date, amount,
                       payment_mode, source, transcript, status, created_by)
  values (b, p_group, p_version, (p->>'party_id')::uuid, nullif(p->>'site_id','')::uuid, t,
          coalesce((p->>'entry_date')::date, current_date), amt,
          nullif(p->>'payment_mode','')::payment_mode, coalesce(p->>'source','manual'), p->>'transcript',
          'active', auth.uid())
  returning id into e;

  for l in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    insert into entry_lines (business_id, entry_id, material_id, quantity, unit, rate, gst_bp, line_total)
    values (b, e, (l->>'material_id')::uuid, (l->>'quantity')::bigint, l->>'unit', (l->>'rate')::bigint,
            (l->>'gst_bp')::int, (l->>'line_total')::bigint);
  end loop;
  return e;
end $$;
revoke all on function _write_entry(jsonb, uuid, int) from public, anon, authenticated;

create function save_entry(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  e := _write_entry(p, gen_random_uuid(), 1);
  insert into audit_log (business_id, entry_id, action, new_value, user_id)
  values ((p->>'business_id')::uuid, e, 'create', p, auth.uid());
  return e;
end $$;

-- Edit = new version; original stays (FR-42). Reason is required.
create function edit_entry(p_entry_id uuid, p jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare old entries; e uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into old from entries where id = p_entry_id for update;
  if not found or not is_member(old.business_id) then raise exception 'entry not found'; end if;
  if old.status <> 'active' then raise exception 'only the active version can be edited'; end if;
  if (p->>'business_id')::uuid <> old.business_id or (p->>'party_id')::uuid <> old.party_id then
    raise exception 'business and party cannot change on edit'; end if;
  update entries set status = 'edited' where id = old.id;
  e := _write_entry(p, old.entry_group, old.version + 1);
  insert into audit_log (business_id, entry_id, action, old_value, new_value, user_id, reason)
  values (old.business_id, e, 'edit', to_jsonb(old), p, auth.uid(), p_reason);
  return e;
end $$;

-- Cancel keeps the row visible with zero balance effect (BR-7).
create function cancel_entry(p_entry_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare old entries;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into old from entries where id = p_entry_id for update;
  if not found or not is_member(old.business_id) then raise exception 'entry not found'; end if;
  if old.status <> 'active' then raise exception 'already % ', old.status; end if;
  update entries set status = 'cancelled' where id = old.id;
  insert into audit_log (business_id, entry_id, action, old_value, user_id, reason)
  values (old.business_id, old.id, 'cancel', to_jsonb(old), auth.uid(), p_reason);
end $$;

grant execute on function create_business(text, text, lang, text), save_entry(jsonb),
  edit_entry(uuid, jsonb, text), cancel_entry(uuid, text) to authenticated;
