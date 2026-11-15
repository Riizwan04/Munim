-- Step 13: offline saving. The phone makes a unique id (client_id) for every new entry, so uploading the same entry
-- twice (for example after the connection dropped right after the server saved it) can never create a second copy.
-- Safe to run more than once. Old apps that do not send client_id keep working.

alter table entries add column if not exists client_id uuid;
create unique index if not exists entries_client_id_uniq on entries (business_id, client_id) where client_id is not null;

-- Internal: validate + insert one entry version. p = jsonb payload.
create or replace function _write_entry(p jsonb, p_group uuid, p_version int)
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
                       payment_mode, source, transcript, status, created_by, client_id)
  values (b, p_group, p_version, (p->>'party_id')::uuid, nullif(p->>'site_id','')::uuid, t,
          coalesce((p->>'entry_date')::date, current_date), amt,
          nullif(p->>'payment_mode','')::payment_mode, coalesce(p->>'source','manual'), p->>'transcript',
          'active', auth.uid(), nullif(p->>'client_id','')::uuid)
  returning id into e;

  for l in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    insert into entry_lines (business_id, entry_id, material_id, quantity, unit, rate, gst_bp, line_total)
    values (b, e, (l->>'material_id')::uuid, (l->>'quantity')::bigint, l->>'unit', (l->>'rate')::bigint,
            (l->>'gst_bp')::int, (l->>'line_total')::bigint);
  end loop;
  return e;
end $$;

create or replace function save_entry(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e uuid;
  b uuid := (p->>'business_id')::uuid;
  cid uuid := nullif(p->>'client_id', '')::uuid;
begin
  if cid is not null then
    if not is_member(b) then raise exception 'not a member of this business'; end if;
    select id into e from entries where business_id = b and client_id = cid;
    if found then return e; end if;            -- already saved: return it, add nothing
  end if;
  begin
    e := _write_entry(p, gen_random_uuid(), 1);
  exception when unique_violation then          -- two uploads of the same entry at the same moment
    select id into e from entries where business_id = b and client_id = cid;
    if found then return e; end if;
    raise;
  end;
  insert into audit_log (business_id, entry_id, action, new_value, user_id)
  values (b, e, 'create', p, auth.uid());
  return e;
end $$;
