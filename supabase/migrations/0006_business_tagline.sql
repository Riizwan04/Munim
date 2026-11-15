-- 0006: a short line under the business name (e.g. "Building Materials · Panvel"), shown in the app and on the customer page.
alter table businesses add column if not exists tagline text not null default '';

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
    'business', jsonb_build_object('name', biz.name, 'tagline', biz.tagline),
    'party', jsonb_build_object('name', party.name, 'opening_balance', party.opening_balance, 'language', party.preferred_language),
    'sites', sites, 'entries', entries, 'expires_at', l.expires_at, 'generated_at', now());
end $$;

revoke all on function get_statement(text, text) from public;
grant execute on function get_statement(text, text) to anon, authenticated;
