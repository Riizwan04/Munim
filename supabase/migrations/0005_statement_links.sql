-- Step 14: customer statement links. A dealer creates a secret, expiring link for one party. The customer opens it in a
-- browser (no app, no account), enters the last 4 digits of their own phone number, and sees ONLY that party's statement.
-- Security: the link token is random (192 bits) and only its hash is stored; wrong codes lock the link; links expire and can
-- be revoked; the public function returns one party's data and nothing else. (Phone OTP can replace the code later.)

create table statement_links (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  party_id        uuid not null references parties(id) on delete cascade,
  token_hash      text not null unique,                      -- sha256 of the token; the token itself is never stored
  pin_required    boolean not null default true,             -- code = last 4 digits of the party's phone
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  created_by      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  view_count      integer not null default 0,
  last_viewed_at  timestamptz,
  failed_attempts integer not null default 0,
  locked_until    timestamptz
);
create index on statement_links (party_id, created_at desc);

alter table statement_links enable row level security;
-- Staff can see the links of their own business (never the token: only its hash exists). Changes go through the functions below.
create policy staff_read on statement_links for select using (is_member(business_id));
revoke insert, update, delete on statement_links from authenticated;
revoke all on statement_links from anon;

create or replace function create_statement_link(p_party_id uuid, p_days integer default 30, p_pin_required boolean default true)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  party parties; token text; l statement_links;
begin
  select * into party from parties where id = p_party_id;
  if not found or not is_member(party.business_id) then raise exception 'party not found'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'days must be between 1 and 365'; end if;
  token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');      -- 32 URL-safe characters
  insert into statement_links (business_id, party_id, token_hash, pin_required, expires_at)
  values (party.business_id, party.id, encode(digest(token, 'sha256'), 'hex'), p_pin_required, now() + make_interval(days => p_days))
  returning * into l;
  return jsonb_build_object('id', l.id, 'token', token, 'expires_at', l.expires_at, 'pin_required', l.pin_required);
end $$;

create or replace function revoke_statement_link(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l statement_links;
begin
  select * into l from statement_links where id = p_id;
  if not found or not is_member(l.business_id) then raise exception 'link not found'; end if;
  update statement_links set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end $$;

-- PUBLIC (callable without logging in). Returns an error code, or one party's statement data.
create or replace function get_statement(p_token text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l statement_links; party parties; biz businesses; fails integer; entries jsonb; sites jsonb;
begin
  select * into l from statement_links where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found or l.revoked_at is not null or l.expires_at <= now() then return jsonb_build_object('error', 'invalid'); end if;
  if l.locked_until is not null and l.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  select * into party from parties where id = l.party_id;
  select * into biz from businesses where id = l.business_id;

  if l.pin_required then
    if coalesce(p_pin, '') = '' then return jsonb_build_object('error', 'pin_required'); end if;
    if p_pin <> right(regexp_replace(party.phone, '\D', '', 'g'), 4) then
      fails := l.failed_attempts + 1;
      update statement_links
         set failed_attempts = case when fails >= 5 then 0 else fails end,
             locked_until = case when fails >= 5 then now() + interval '15 minutes' else locked_until end
       where id = l.id;
      return jsonb_build_object('error', case when fails >= 5 then 'locked' else 'wrong_pin' end);
    end if;
  end if;

  update statement_links set failed_attempts = 0, view_count = view_count + 1, last_viewed_at = now() where id = l.id;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) into sites from sites s where s.party_id = party.id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'date', e.entry_date, 'type', e.type, 'amount', e.amount, 'payment_mode', e.payment_mode, 'site_id', e.site_id,
           'lines', coalesce((select jsonb_agg(jsonb_build_object('name', m.name, 'quantity', el.quantity, 'unit', el.unit, 'rate', el.rate, 'gst_bp', el.gst_bp, 'line_total', el.line_total) order by el.id)
                              from entry_lines el join materials m on m.id = el.material_id where el.entry_id = e.id), '[]'::jsonb)
         ) order by e.entry_date, e.created_at), '[]'::jsonb) into entries
    from entries e where e.party_id = party.id and e.status = 'active';

  return jsonb_build_object(
    'business', jsonb_build_object('name', biz.name),
    'party', jsonb_build_object('name', party.name, 'opening_balance', party.opening_balance, 'language', party.preferred_language),
    'sites', sites, 'entries', entries, 'expires_at', l.expires_at, 'generated_at', now());
end $$;

revoke all on function get_statement(text, text) from public;
grant execute on function get_statement(text, text) to anon, authenticated;
revoke all on function create_statement_link(uuid, integer, boolean) from public, anon;
grant execute on function create_statement_link(uuid, integer, boolean) to authenticated;
revoke all on function revoke_statement_link(uuid) from public, anon;
grant execute on function revoke_statement_link(uuid) to authenticated;
