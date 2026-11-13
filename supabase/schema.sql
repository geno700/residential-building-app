-- Residential Building App: database schema for Supabase (many buildings in one database).
-- Run this whole file in the Supabase SQL Editor (Dashboard > SQL Editor > New query > Run).
-- It is safe to run again.
--
-- Who can do what:
--   Manager  : a normal Supabase login (email + password). Sees and changes everything in the
--              buildings they created, through the access rules at the end of this file.
--   Resident : no Supabase login. Signs in with building code + apartment + password through
--              resident_login(), which returns a session token. Everything a resident can see
--              comes from resident_overview(token). Residents cannot change passwords.

create extension if not exists pgcrypto with schema extensions;

-- Helpers that the app must not call directly live here. The API only exposes "public".
create schema if not exists private;

-- ---------------------------------------------------------------- tables

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  code text not null unique,
  manager_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  currency text not null default 'EGP' check (length(currency) <= 8),
  -- Money already in the building fund before the app was used.
  opening_cash numeric not null default 0,
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 20),
  floor int,
  resident_name text,
  phone text,
  monthly_fee numeric not null default 0 check (monthly_fee >= 0),
  -- Set by the manager. Positive: the apartment owes this much. Negative: it has credit.
  opening_balance numeric not null default 0,
  -- First month the monthly fee is charged for.
  charge_from date not null default date_trunc('month', now())::date,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (building_id, label),
  unique (building_id, id)
);

-- Apartment passwords. No access rules, so only the functions below can read or write it.
create table if not exists public.unit_access (
  unit_id uuid primary key references public.units (id) on delete cascade,
  password_hash text not null,
  failed int not null default 0,
  locked_until timestamptz
);

create table if not exists public.resident_sessions (
  token_hash text primary key,
  unit_id uuid not null references public.units (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists resident_sessions_unit_idx on public.resident_sessions (unit_id);

-- The ledger. Amounts are always positive; "kind" says what the money was.
--   due          monthly fee charged to an apartment          (apartment owes the building)
--   payment      apartment paid fees                          (cash into the building fund)
--   bill         manager paid a bill for an apartment         (apartment owes the manager)
--   bill_payment apartment repaid the manager for bills
--   expense      the building spent money                     (cash out of the building fund)
--   income       other money the building received            (cash into the building fund)
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  unit_id uuid,
  kind text not null check (kind in ('due', 'payment', 'bill', 'bill_payment', 'expense', 'income')),
  amount numeric not null check (amount > 0),
  entry_date date not null default current_date,
  month date,
  category text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (building_id, unit_id) references public.units (building_id, id) on delete cascade,
  check ((kind in ('due', 'payment', 'bill', 'bill_payment')) = (unit_id is not null))
);
create index if not exists entries_building_idx on public.entries (building_id, entry_date desc);
create index if not exists entries_unit_idx on public.entries (unit_id);
-- One monthly fee per apartment per month.
create unique index if not exists entries_due_once on public.entries (unit_id, month) where kind = 'due';

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  details text,
  status text not null default 'open' check (status in ('open', 'progress', 'done')),
  -- The apartment that reported it, if a resident did.
  unit_id uuid references public.units (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists maintenance_building_idx on public.maintenance (building_id, created_at desc);

-- ---------------------------------------------------------------- private helpers

create or replace function private.new_code() returns text
language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(gen_random_bytes(1), 0) % 32) + 1, 1), '')
  from generate_series(1, 6);
$$;

create or replace function private.new_password() returns text
language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;

create or replace function private.token_hash(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- The apartment a resident session belongs to, or null if the session is unknown or expired.
create or replace function private.session_unit(p_token text) returns uuid
language sql stable set search_path = public, extensions as $$
  select unit_id from public.resident_sessions
  where token_hash = private.token_hash(p_token) and expires_at > now();
$$;

-- Adds the monthly fee for every month up to the current one that is not charged yet.
create or replace function private.charge_dues(p_building uuid) returns void
language sql volatile set search_path = public as $$
  insert into public.entries (building_id, unit_id, kind, amount, entry_date, month, created_by)
  select u.building_id, u.id, 'due', u.monthly_fee, m::date, m::date, null
  from public.buildings b
  join public.units u on u.building_id = b.id
  cross join lateral generate_series(
    u.charge_from::timestamp,
    date_trunc('month', now() at time zone b.timezone),
    interval '1 month'
  ) m
  where b.id = p_building and u.monthly_fee > 0
  on conflict (unit_id, month) where kind = 'due' do nothing;
$$;

-- Per apartment: fees still owed (negative = paid in advance) and bills still owed to the manager.
create or replace function private.unit_balances(p_building uuid)
returns table (unit_id uuid, dues numeric, bills numeric)
language sql stable set search_path = public as $$
  select u.id,
    u.opening_balance
      + coalesce(sum(case e.kind when 'due' then e.amount when 'payment' then -e.amount else 0 end), 0),
    coalesce(sum(case e.kind when 'bill' then e.amount when 'bill_payment' then -e.amount else 0 end), 0)
  from public.units u
  left join public.entries e on e.unit_id = u.id
  where u.building_id = p_building
  group by u.id;
$$;

create or replace function private.summary(p_building uuid) returns jsonb
language sql stable set search_path = public as $$
  with money as (
    select
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as collected,
      coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent
    from public.entries where building_id = p_building
  ), owed as (
    select
      coalesce(sum(greatest(dues, 0)), 0) as dues_owed,
      coalesce(sum(greatest(-dues, 0)), 0) as advance,
      coalesce(sum(bills), 0) as bills_owed
    from private.unit_balances(p_building)
  )
  select jsonb_build_object(
    'cash', b.opening_cash + money.collected + money.income - money.spent,
    'opening_cash', b.opening_cash,
    'collected', money.collected,
    'income', money.income,
    'spent', money.spent,
    'dues_owed', owed.dues_owed,
    'advance', owed.advance,
    'bills_owed', owed.bills_owed
  )
  from public.buildings b, money, owed
  where b.id = p_building;
$$;

-- ---------------------------------------------------------------- manager functions

create or replace function public.is_manager(p_building uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.buildings where id = p_building and manager_id = auth.uid());
$$;

-- Start a building. Creates the apartments and a password for each one.
-- The passwords are returned once here and are never readable again (only replaceable).
create or replace function public.create_building(
  p_name text,
  p_floors int,
  p_per_floor int,
  p_fee numeric,
  p_currency text default 'EGP'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_b public.buildings;
  v_code text;
  v_n int := 0;
  v_unit uuid;
  v_pw text;
  v_list jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_allowed';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0
     or p_floors is null or p_floors < 1 or p_floors > 100
     or p_per_floor is null or p_per_floor < 1 or p_per_floor > 50
     or p_floors * p_per_floor > 300
     or p_fee is null or p_fee < 0 then
    raise exception 'bad_input';
  end if;
  if (select count(*) from public.buildings where manager_id = auth.uid()) >= 5 then
    raise exception 'too_many_buildings';
  end if;

  loop
    v_code := private.new_code();
    exit when not exists (select 1 from public.buildings where code = v_code);
  end loop;

  insert into public.buildings (name, code, manager_id, currency)
  values (trim(p_name), v_code, auth.uid(), coalesce(nullif(trim(p_currency), ''), 'EGP'))
  returning * into v_b;

  for f in 1..p_floors loop
    for k in 1..p_per_floor loop
      v_n := v_n + 1;
      v_pw := private.new_password();
      insert into public.units (building_id, label, floor, monthly_fee, sort)
      values (v_b.id, v_n::text, f, p_fee, v_n)
      returning id into v_unit;
      insert into public.unit_access (unit_id, password_hash) values (v_unit, crypt(v_pw, gen_salt('bf')));
      v_list := v_list || jsonb_build_object('label', v_n::text, 'floor', f, 'password', v_pw);
    end loop;
  end loop;

  return jsonb_build_object('building', to_jsonb(v_b), 'passwords', v_list);
end;
$$;

-- Set one apartment's password. Leave p_password empty to get a random one. Returns the password.
create or replace function public.set_unit_password(p_unit uuid, p_password text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_building uuid;
  v_pw text := nullif(trim(coalesce(p_password, '')), '');
begin
  select building_id into v_building from public.units where id = p_unit;
  if v_building is null or not public.is_manager(v_building) then
    raise exception 'not_allowed';
  end if;
  if v_pw is null then
    v_pw := private.new_password();
  elsif length(v_pw) < 4 then
    raise exception 'short_password';
  end if;
  insert into public.unit_access (unit_id, password_hash) values (p_unit, crypt(v_pw, gen_salt('bf')))
  on conflict (unit_id) do update set password_hash = excluded.password_hash, failed = 0, locked_until = null;
  delete from public.resident_sessions where unit_id = p_unit;
  return v_pw;
end;
$$;

-- Give every apartment in a building a new random password. Returns the list once.
create or replace function public.reset_all_passwords(p_building uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_pw text;
  v_list jsonb := '[]'::jsonb;
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  for r in select id, label, floor from public.units where building_id = p_building order by sort, label loop
    v_pw := private.new_password();
    insert into public.unit_access (unit_id, password_hash) values (r.id, crypt(v_pw, gen_salt('bf')))
    on conflict (unit_id) do update set password_hash = excluded.password_hash, failed = 0, locked_until = null;
    delete from public.resident_sessions where unit_id = r.id;
    v_list := v_list || jsonb_build_object('label', r.label, 'floor', r.floor, 'password', v_pw);
  end loop;
  return v_list;
end;
$$;

-- Everything the manager's home page needs: totals and every apartment with its balances.
create or replace function public.manager_overview(p_building uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  perform private.charge_dues(p_building);
  return jsonb_build_object(
    'summary', private.summary(p_building),
    'units', coalesce((
      select jsonb_agg(
        to_jsonb(u) || jsonb_build_object(
          'dues', b.dues,
          'bills', b.bills,
          'has_password', exists (select 1 from public.unit_access a where a.unit_id = u.id)
        ) order by u.sort, u.label
      )
      from public.units u
      join private.unit_balances(p_building) b on b.unit_id = u.id
      where u.building_id = p_building
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- resident functions

-- Sign in as an apartment. Returns { ok, token } or { ok: false, error }.
-- Five wrong passwords lock the apartment for 15 minutes.
create or replace function public.resident_login(p_code text, p_unit text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_unit uuid;
  v_acc public.unit_access;
  v_token text;
begin
  select u.id into v_unit
  from public.units u
  join public.buildings b on b.id = u.building_id
  where b.code = upper(trim(coalesce(p_code, ''))) and lower(u.label) = lower(trim(coalesce(p_unit, '')));
  if v_unit is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_login');
  end if;

  select * into v_acc from public.unit_access where unit_id = v_unit for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'wrong_login');
  end if;
  if v_acc.locked_until is not null and v_acc.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  if v_acc.password_hash = crypt(coalesce(p_password, ''), v_acc.password_hash) then
    update public.unit_access set failed = 0, locked_until = null where unit_id = v_unit;
    delete from public.resident_sessions where unit_id = v_unit and expires_at < now();
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into public.resident_sessions (token_hash, unit_id, expires_at)
    values (private.token_hash(v_token), v_unit, now() + interval '90 days');
    return jsonb_build_object('ok', true, 'token', v_token);
  end if;

  if v_acc.failed + 1 >= 5 then
    update public.unit_access set failed = 0, locked_until = now() + interval '15 minutes' where unit_id = v_unit;
  else
    update public.unit_access set failed = failed + 1 where unit_id = v_unit;
  end if;
  return jsonb_build_object('ok', false, 'error', 'wrong_login');
end;
$$;

create or replace function public.resident_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.resident_sessions where token_hash = private.token_hash(p_token);
$$;

-- Everything a resident may see: their own apartment and statement, and the building's money.
-- Other apartments' balances are never included.
create or replace function public.resident_overview(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_unit public.units;
  v_b public.buildings;
  v_bal record;
begin
  select u.* into v_unit from public.units u where u.id = private.session_unit(p_token);
  if not found then
    raise exception 'session_expired';
  end if;
  select * into v_b from public.buildings where id = v_unit.building_id;
  perform private.charge_dues(v_b.id);
  select * into v_bal from private.unit_balances(v_b.id) where unit_id = v_unit.id;

  return jsonb_build_object(
    'building', jsonb_build_object('name', v_b.name, 'currency', v_b.currency),
    'unit', jsonb_build_object(
      'label', v_unit.label, 'floor', v_unit.floor, 'resident_name', v_unit.resident_name,
      'monthly_fee', v_unit.monthly_fee, 'opening_balance', v_unit.opening_balance,
      'dues', v_bal.dues, 'bills', v_bal.bills
    ),
    'statement', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.created_at desc)
      from (
        select id, kind, amount, entry_date, month, category, note, created_at
        from public.entries where unit_id = v_unit.id
        order by entry_date desc, created_at desc limit 500
      ) x
    ), '[]'::jsonb),
    'summary', private.summary(v_b.id),
    'ledger', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.created_at desc)
      from (
        select id, kind, amount, entry_date, category, note, created_at
        from public.entries where building_id = v_b.id and kind in ('expense', 'income')
        order by entry_date desc, created_at desc limit 300
      ) x
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.month desc)
      from (
        select date_trunc('month', entry_date)::date as month,
          coalesce(sum(amount) filter (where kind = 'payment'), 0) as collected,
          coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
          coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent
        from public.entries
        where building_id = v_b.id and kind in ('payment', 'income', 'expense')
        group by 1 order by 1 desc limit 12
      ) x
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, title, details, status, created_at, done_at, (unit_id = v_unit.id) as mine
        from public.maintenance where building_id = v_b.id
        order by created_at desc limit 100
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- A resident reports a problem. It appears on the manager's maintenance page.
create or replace function public.resident_report(p_token text, p_title text, p_details text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_unit public.units;
begin
  select u.* into v_unit from public.units u where u.id = private.session_unit(p_token);
  if not found then
    raise exception 'session_expired';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'bad_input';
  end if;
  if (select count(*) from public.maintenance where unit_id = v_unit.id and status <> 'done') >= 5 then
    raise exception 'too_many_reports';
  end if;
  insert into public.maintenance (building_id, title, details, unit_id)
  values (v_unit.building_id, left(trim(p_title), 120), nullif(left(trim(coalesce(p_details, '')), 1000), ''), v_unit.id);
end;
$$;

-- Who may call what.
revoke execute on function public.create_building(text, int, int, numeric, text) from public, anon;
revoke execute on function public.set_unit_password(uuid, text) from public, anon;
revoke execute on function public.reset_all_passwords(uuid) from public, anon;
revoke execute on function public.manager_overview(uuid) from public, anon;
grant execute on function public.create_building(text, int, int, numeric, text) to authenticated;
grant execute on function public.set_unit_password(uuid, text) to authenticated;
grant execute on function public.reset_all_passwords(uuid) to authenticated;
grant execute on function public.manager_overview(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to anon, authenticated;
grant execute on function public.resident_login(text, text, text) to anon, authenticated;
grant execute on function public.resident_logout(text) to anon, authenticated;
grant execute on function public.resident_overview(text) to anon, authenticated;
grant execute on function public.resident_report(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- access rules
-- Only the manager of a building reads or writes its rows directly.
-- Residents never touch the tables; they go through the resident_ functions above.

alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.unit_access enable row level security;
alter table public.resident_sessions enable row level security;
alter table public.entries enable row level security;
alter table public.maintenance enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('buildings', 'units', 'unit_access', 'resident_sessions', 'entries', 'maintenance')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Buildings are created with create_building().
create policy "manager reads own buildings" on public.buildings for select to authenticated
  using (manager_id = auth.uid());
create policy "manager edits own buildings" on public.buildings for update to authenticated
  using (manager_id = auth.uid()) with check (manager_id = auth.uid());
create policy "manager deletes own buildings" on public.buildings for delete to authenticated
  using (manager_id = auth.uid());

create policy "manager reads apartments" on public.units for select to authenticated
  using (public.is_manager(building_id));
create policy "manager adds apartments" on public.units for insert to authenticated
  with check (public.is_manager(building_id));
create policy "manager edits apartments" on public.units for update to authenticated
  using (public.is_manager(building_id)) with check (public.is_manager(building_id));
create policy "manager deletes apartments" on public.units for delete to authenticated
  using (public.is_manager(building_id));

create policy "manager reads entries" on public.entries for select to authenticated
  using (public.is_manager(building_id));
create policy "manager adds entries" on public.entries for insert to authenticated
  with check (public.is_manager(building_id));
create policy "manager deletes entries" on public.entries for delete to authenticated
  using (public.is_manager(building_id));

create policy "manager reads maintenance" on public.maintenance for select to authenticated
  using (public.is_manager(building_id));
create policy "manager adds maintenance" on public.maintenance for insert to authenticated
  with check (public.is_manager(building_id));
create policy "manager edits maintenance" on public.maintenance for update to authenticated
  using (public.is_manager(building_id)) with check (public.is_manager(building_id));
create policy "manager deletes maintenance" on public.maintenance for delete to authenticated
  using (public.is_manager(building_id));
