-- 0007: customers who turn on notifications from their statement link (free web push).
-- A subscription belongs to one party and is tied to the statement link it was made from: revoking the link stops the notifications.

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  party_id    uuid not null references parties(id) on delete cascade,
  link_id     uuid not null references statement_links(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz
);
create index on push_subscriptions (party_id);

alter table push_subscriptions enable row level security;
-- The shop may see THAT a customer has notifications on (to show a bell), never the keys.
create policy staff_read on push_subscriptions for select using (is_member(business_id));
revoke all on push_subscriptions from anon, authenticated;
grant select (id, business_id, party_id, created_at, last_sent_at) on push_subscriptions to authenticated;

-- Customer turns notifications on. Same checks as opening the statement (link valid, 4-digit code, lock after 5 wrong tries).
create or replace function subscribe_push(p_token text, p_pin text, p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s jsonb; l statement_links;
begin
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' or length(p_endpoint) > 1000 then
    return jsonb_build_object('error', 'bad_request');
  end if;
  s := get_statement(p_token, p_pin);
  if s ? 'error' then return jsonb_build_object('error', s->>'error'); end if;
  select * into l from statement_links where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  insert into push_subscriptions (business_id, party_id, link_id, endpoint, p256dh, auth)
  values (l.business_id, l.party_id, l.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set business_id = excluded.business_id, party_id = excluded.party_id, link_id = excluded.link_id,
                                       p256dh = excluded.p256dh, auth = excluded.auth;
  -- a customer who wants notifications keeps their link: valid for at least a year from now
  update statement_links set expires_at = greatest(expires_at, now() + interval '365 days') where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

-- Customer turns notifications off on this phone.
create or replace function unsubscribe_push(p_token text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l statement_links;
begin
  select * into l from statement_links where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return jsonb_build_object('error', 'invalid'); end if;
  delete from push_subscriptions where endpoint = p_endpoint and party_id = l.party_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function subscribe_push(text, text, text, text, text) from public;
grant execute on function subscribe_push(text, text, text, text, text) to anon, authenticated;
revoke all on function unsubscribe_push(text, text) from public;
grant execute on function unsubscribe_push(text, text) to anon, authenticated;
