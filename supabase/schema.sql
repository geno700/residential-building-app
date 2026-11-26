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
  -- restrict: deleting the manager's login must never delete the building (see the fix below).
  manager_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  currency text not null default 'EGP' check (length(currency) <= 8),
  -- Money already in the building fund before the app was used.
  opening_cash numeric not null default 0,
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now()
);

-- Databases created before 2026-11-25 had "on delete cascade" here, so deleting a manager's
-- account deleted the building with all its apartments, entries and backups. Switch them to restrict.
alter table public.buildings drop constraint if exists buildings_manager_id_fkey;
alter table public.buildings
  add constraint buildings_manager_id_fkey
  foreign key (manager_id) references auth.users (id) on delete restrict;

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
-- The password as the manager set it, so the manager can read it again and send it to the resident.
-- Empty for passwords set before this column existed (they still work, but cannot be shown).
alter table public.unit_access add column if not exists password text;

create table if not exists public.resident_sessions (
  token_hash text primary key,
  unit_id uuid not null references public.units (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists resident_sessions_unit_idx on public.resident_sessions (unit_id);

-- The ledger. Amounts are always positive; "kind" says what the money was.
--   due          monthly fee charged to an apartment          (apartment owes the building)
--   extra        one-time extra fee, e.g. an upgrade project  (apartment owes the building)
--   payment      apartment paid fees                          (cash into the building fund)
--   bill         manager paid a bill for an apartment         (apartment owes the manager)
--   bill_payment apartment repaid the manager for bills
--   expense      the building spent money                     (cash out of the building fund)
--   income       other money the building received            (cash into the building fund)
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  unit_id uuid,
  kind text not null,
  amount numeric not null check (amount > 0),
  entry_date date not null default current_date,
  month date,
  category text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (building_id, unit_id) references public.units (building_id, id) on delete cascade
);
-- The allowed kinds, and which of them belong to an apartment. Replaced on every run so that
-- an older database picks up new kinds.
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries drop constraint if exists entries_check;
alter table public.entries drop constraint if exists entries_kinds;
alter table public.entries drop constraint if exists entries_unit_kinds;
alter table public.entries add constraint entries_kinds
  check (kind in ('due', 'extra', 'payment', 'bill', 'bill_payment', 'expense', 'income'));
alter table public.entries add constraint entries_unit_kinds
  check ((kind in ('due', 'extra', 'payment', 'bill', 'bill_payment')) = (unit_id is not null));
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

-- Extra managers of a building. The person who created it (buildings.manager_id) is its owner
-- and is not listed here. No access rules: read and changed only through the functions below.
create table if not exists public.building_managers (
  building_id uuid not null references public.buildings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (building_id, user_id)
);
create index if not exists building_managers_user_idx on public.building_managers (user_id);

-- Saved copies of a building's data. No access rules: read and written only through the functions below.
--   auto            taken once a day when a manager opens the building
--   manual          the manager pressed "Back up now"
--   before_restore  taken automatically just before a restore, so a restore can be undone
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  kind text not null default 'manual' check (kind in ('auto', 'manual', 'before_restore')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  data jsonb not null
);
create index if not exists backups_building_idx on public.backups (building_id, created_at desc);

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

-- Apartment code from its floor and its position on the floor:
--   1 per floor: F3      2 per floor: F3-R, F3-L (right, left)      more: F3-1, F3-2, F3-3 ...
create or replace function private.unit_label(p_floor int, p_k int, p_per_floor int) returns text
language sql immutable as $$
  select case
    when p_per_floor <= 1 then 'F' || p_floor
    when p_per_floor = 2 then 'F' || p_floor || '-' || case when p_k = 1 then 'R' else 'L' end
    else 'F' || p_floor || '-' || p_k
  end;
$$;

-- A label as people type it: no spaces, hyphens or underscores, lower case. "f1 r" finds "F1-R".
create or replace function private.loose(p_text text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(p_text, ''), '[\s_-]', '', 'g'));
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
      + coalesce(sum(case e.kind when 'due' then e.amount when 'extra' then e.amount when 'payment' then -e.amount else 0 end), 0),
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

-- Everything in a building as one document: the content of a backup.
create or replace function private.snapshot(p_building uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'app', 'residential-building-app',
    'version', 1,
    'taken_at', now(),
    'building', (
      select jsonb_build_object('name', b.name, 'code', b.code, 'currency', b.currency, 'opening_cash', b.opening_cash)
      from public.buildings b where b.id = p_building
    ),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'label', u.label, 'floor', u.floor, 'resident_name', u.resident_name, 'phone', u.phone,
        'monthly_fee', u.monthly_fee, 'opening_balance', u.opening_balance, 'charge_from', u.charge_from,
        'sort', u.sort, 'created_at', u.created_at, 'password', a.password
      ) order by u.sort, u.label)
      from public.units u left join public.unit_access a on a.unit_id = u.id
      where u.building_id = p_building
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'unit_id', e.unit_id, 'kind', e.kind, 'amount', e.amount, 'entry_date', e.entry_date,
        'month', e.month, 'category', e.category, 'note', e.note, 'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.entries e where e.building_id = p_building
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'details', m.details, 'status', m.status, 'unit_id', m.unit_id,
        'created_at', m.created_at, 'done_at', m.done_at
      ) order by m.created_at, m.id)
      from public.maintenance m where m.building_id = p_building
    ), '[]'::jsonb)
  );
$$;

-- Saves a backup and drops the oldest ones of the same kind (30 daily ones, 20 of the others).
create or replace function private.save_backup(p_building uuid, p_kind text) returns uuid
language plpgsql volatile set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.backups (building_id, kind, data)
  values (p_building, p_kind, private.snapshot(p_building))
  returning id into v_id;
  delete from public.backups
  where building_id = p_building and kind = p_kind and id not in (
    select id from public.backups
    where building_id = p_building and kind = p_kind
    order by created_at desc
    limit case when p_kind = 'auto' then 30 else 20 end
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- manager functions

create or replace function public.is_manager(p_building uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.buildings where id = p_building and manager_id = auth.uid())
      or exists (select 1 from public.building_managers where building_id = p_building and user_id = auth.uid());
$$;

-- The owner is the manager who created the building. Only the owner adds or removes
-- other managers and deletes the building.
create or replace function public.is_owner(p_building uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.buildings where id = p_building and manager_id = auth.uid());
$$;

-- Everyone who manages a building, the owner first.
create or replace function public.list_managers(p_building uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', x.email, 'owner', x.owner) order by x.owner desc, x.created_at)
    from (
      select b.manager_id as user_id, u.email, true as owner, b.created_at
      from public.buildings b join auth.users u on u.id = b.manager_id
      where b.id = p_building
      union all
      select m.user_id, u.email, false, m.created_at
      from public.building_managers m join auth.users u on u.id = m.user_id
      where m.building_id = p_building
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Give another person full manager access. They must already have a manager account.
create or replace function public.add_manager(p_building uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not public.is_owner(p_building) then
    raise exception 'owner_only';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if v_user is null then
    raise exception 'no_account';
  end if;
  if v_user = auth.uid() then
    return;
  end if;
  if (select count(*) from public.building_managers where building_id = p_building) >= 10 then
    raise exception 'too_many_managers';
  end if;
  insert into public.building_managers (building_id, user_id) values (p_building, v_user)
  on conflict do nothing;
end;
$$;

-- The owner removes a manager, or a manager removes themself.
create or replace function public.remove_manager(p_building uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner(p_building) or p_user = auth.uid()) then
    raise exception 'owner_only';
  end if;
  delete from public.building_managers where building_id = p_building and user_id = p_user;
end;
$$;

-- Make an apartment's fee balance exactly p_target right now (positive: it owes, negative: credit).
-- The difference goes into its opening balance, so the statement still adds up.
create or replace function public.set_unit_balance(p_unit uuid, p_target numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_building uuid;
  v_dues numeric;
begin
  select building_id into v_building from public.units where id = p_unit;
  if v_building is null or not public.is_manager(v_building) then
    raise exception 'not_allowed';
  end if;
  if p_target is null then
    raise exception 'bad_input';
  end if;
  perform private.charge_dues(v_building);
  select dues into v_dues from private.unit_balances(v_building) where unit_id = p_unit;
  update public.units set opening_balance = opening_balance + (p_target - v_dues) where id = p_unit;
end;
$$;

-- When an apartment's monthly fee changes, this month's charge follows it.
-- Earlier months keep the amount they were charged.
create or replace function public.units_sync_due() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_month date;
begin
  if new.monthly_fee is distinct from old.monthly_fee then
    select date_trunc('month', now() at time zone b.timezone)::date into v_month
    from public.buildings b where b.id = new.building_id;
    if new.monthly_fee > 0 then
      update public.entries set amount = new.monthly_fee
      where unit_id = new.id and kind = 'due' and month = v_month;
    else
      delete from public.entries where unit_id = new.id and kind = 'due' and month = v_month;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists units_sync_due on public.units;
create trigger units_sync_due
  after update of monthly_fee on public.units
  for each row execute function public.units_sync_due();

-- Rename every apartment from its floor: coded (F1-R, F1-L ...) or numbered (1, 2, 3 ...).
-- Apartments without a floor keep their name. Passwords and balances are not touched.
create or replace function public.relabel_units(p_building uuid, p_coded boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  -- Two steps, so a new name never collides with an old one that is about to change.
  update public.units set label = substr(md5(id::text), 1, 16)
  where building_id = p_building and floor is not null;
  update public.units u set label = x.label
  from (
    select id,
      case when p_coded
        then private.unit_label(
          floor,
          (row_number() over (partition by floor order by sort, created_at))::int,
          (count(*) over (partition by floor))::int)
        else (row_number() over (order by floor, sort, created_at))::text
      end as label
    from public.units where building_id = p_building and floor is not null
  ) x
  where u.id = x.id;
end;
$$;

-- Start a building. Creates the apartments and a password for each one.
-- p_coded: name apartments F1-R, F1-L ... (true) or 1, 2, 3 ... (false).
drop function if exists public.create_building(text, int, int, numeric, text);
create or replace function public.create_building(
  p_name text,
  p_floors int,
  p_per_floor int,
  p_fee numeric,
  p_currency text default 'EGP',
  p_coded boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_b public.buildings;
  v_code text;
  v_n int := 0;
  v_unit uuid;
  v_pw text;
  v_label text;
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
      v_label := case when coalesce(p_coded, true) then private.unit_label(f, k, p_per_floor) else v_n::text end;
      insert into public.units (building_id, label, floor, monthly_fee, sort)
      values (v_b.id, v_label, f, p_fee, v_n)
      returning id into v_unit;
      insert into public.unit_access (unit_id, password_hash, password) values (v_unit, crypt(v_pw, gen_salt('bf')), v_pw);
      v_list := v_list || jsonb_build_object('label', v_label, 'floor', f, 'password', v_pw);
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
  insert into public.unit_access (unit_id, password_hash, password) values (p_unit, crypt(v_pw, gen_salt('bf')), v_pw)
  on conflict (unit_id) do update
    set password_hash = excluded.password_hash, password = excluded.password, failed = 0, locked_until = null;
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
    insert into public.unit_access (unit_id, password_hash, password) values (r.id, crypt(v_pw, gen_salt('bf')), v_pw)
    on conflict (unit_id) do update
      set password_hash = excluded.password_hash, password = excluded.password, failed = 0, locked_until = null;
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
  -- The daily automatic backup. A problem here must never stop the manager from opening the building.
  begin
    if not exists (
      select 1 from public.backups
      where building_id = p_building and kind = 'auto' and created_at > now() - interval '20 hours'
    ) then
      perform private.save_backup(p_building, 'auto');
    end if;
  exception when others then
    null;
  end;
  return jsonb_build_object(
    'summary', private.summary(p_building),
    'units', coalesce((
      select jsonb_agg(
        to_jsonb(u) || jsonb_build_object(
          'dues', b.dues,
          'bills', b.bills,
          'has_password', exists (select 1 from public.unit_access a where a.unit_id = u.id),
          'password', (select a.password from public.unit_access a where a.unit_id = u.id)
        ) order by u.sort, u.label
      )
      from public.units u
      join private.unit_balances(p_building) b on b.unit_id = u.id
      where u.building_id = p_building
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- backups

-- "Back up now": saves a copy in the database and returns it, so the app can also download it as a file.
create or replace function public.backup_now(p_building uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  v_id := private.save_backup(p_building, 'manual');
  return (select data from public.backups where id = v_id);
end;
$$;

-- The saved backups of a building, newest first, without their content.
create or replace function public.list_backups(p_building uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id, 'kind', k.kind, 'created_at', k.created_at,
      'units', jsonb_array_length(k.data -> 'units'), 'entries', jsonb_array_length(k.data -> 'entries')
    ) order by k.created_at desc)
    from public.backups k where k.building_id = p_building
  ), '[]'::jsonb);
end;
$$;

-- The content of one saved backup, to download it.
create or replace function public.get_backup(p_backup uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_building uuid;
  v_data jsonb;
begin
  select building_id, data into v_building, v_data from public.backups where id = p_backup;
  if v_building is null or not public.is_manager(v_building) then
    raise exception 'not_allowed';
  end if;
  return v_data;
end;
$$;

-- Put a building back to a backup: a saved one (p_backup) or the content of a downloaded file (p_data).
-- Apartments, balances, the whole ledger and maintenance become what the backup holds.
-- The current state is saved first as a "before_restore" backup, so this can be undone.
-- Passwords of apartments that still exist are kept; managers and the building code never change.
create or replace function public.restore_backup(p_building uuid, p_backup uuid default null, p_data jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v jsonb := p_data;
begin
  if not public.is_manager(p_building) then
    raise exception 'not_allowed';
  end if;
  if p_backup is not null then
    select data into v from public.backups where id = p_backup and building_id = p_building;
  end if;
  if v is null
     or v ->> 'app' is distinct from 'residential-building-app'
     or jsonb_typeof(v -> 'building') is distinct from 'object'
     or jsonb_typeof(v -> 'units') is distinct from 'array'
     or jsonb_typeof(v -> 'entries') is distinct from 'array'
     or jsonb_array_length(v -> 'units') > 300 then
    raise exception 'bad_backup';
  end if;
  -- A backup of another building that still exists would move its apartments here.
  if exists (
    select 1 from jsonb_to_recordset(v -> 'units') as x(id uuid)
    join public.units u on u.id = x.id
    where u.building_id <> p_building
  ) then
    raise exception 'backup_other_building';
  end if;

  perform private.save_backup(p_building, 'before_restore');

  update public.buildings set
    name = coalesce(nullif(trim(v -> 'building' ->> 'name'), ''), name),
    currency = coalesce(nullif(trim(v -> 'building' ->> 'currency'), ''), currency),
    opening_cash = coalesce((v -> 'building' ->> 'opening_cash')::numeric, opening_cash)
  where id = p_building;

  delete from public.entries where building_id = p_building;
  delete from public.maintenance where building_id = p_building;
  delete from public.units
  where building_id = p_building and id not in (select x.id from jsonb_to_recordset(v -> 'units') as x(id uuid));
  -- Free every name first, so a restored name never collides with one that is about to change.
  update public.units set label = substr(md5(id::text), 1, 16) where building_id = p_building;

  insert into public.units (id, building_id, label, floor, resident_name, phone, monthly_fee, opening_balance, charge_from, sort, created_at)
  select x.id, p_building, x.label, x.floor, x.resident_name, x.phone, coalesce(x.monthly_fee, 0), coalesce(x.opening_balance, 0),
    coalesce(x.charge_from, date_trunc('month', now())::date), coalesce(x.sort, 0), coalesce(x.created_at, now())
  from jsonb_to_recordset(v -> 'units') as x(
    id uuid, label text, floor int, resident_name text, phone text, monthly_fee numeric, opening_balance numeric,
    charge_from date, sort int, created_at timestamptz)
  on conflict (id) do update set
    label = excluded.label, floor = excluded.floor, resident_name = excluded.resident_name, phone = excluded.phone,
    monthly_fee = excluded.monthly_fee, opening_balance = excluded.opening_balance, charge_from = excluded.charge_from,
    sort = excluded.sort;

  -- Apartments that came back from the backup get the password they had, when the backup knows it.
  insert into public.unit_access (unit_id, password_hash, password)
  select x.id, crypt(x.password, gen_salt('bf')), x.password
  from jsonb_to_recordset(v -> 'units') as x(id uuid, password text)
  where length(coalesce(x.password, '')) >= 4
    and not exists (select 1 from public.unit_access a where a.unit_id = x.id);

  insert into public.entries (id, building_id, unit_id, kind, amount, entry_date, month, category, note, created_by, created_at)
  select coalesce(x.id, gen_random_uuid()), p_building, x.unit_id, x.kind, x.amount, coalesce(x.entry_date, current_date),
    x.month, x.category, x.note, null, coalesce(x.created_at, now())
  from jsonb_to_recordset(v -> 'entries') as x(
    id uuid, unit_id uuid, kind text, amount numeric, entry_date date, month date, category text, note text,
    created_at timestamptz);

  insert into public.maintenance (id, building_id, title, details, status, unit_id, created_at, done_at)
  select coalesce(x.id, gen_random_uuid()), p_building, x.title, x.details, coalesce(x.status, 'open'),
    (select u.id from public.units u where u.id = x.unit_id and u.building_id = p_building),
    coalesce(x.created_at, now()), x.done_at
  from jsonb_to_recordset(coalesce(v -> 'maintenance', '[]'::jsonb)) as x(
    id uuid, title text, details text, status text, unit_id uuid, created_at timestamptz, done_at timestamptz);

  return jsonb_build_object(
    'units', jsonb_array_length(v -> 'units'),
    'entries', jsonb_array_length(v -> 'entries'),
    'taken_at', v ->> 'taken_at'
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
  -- Not typed exactly: accept it without spaces and hyphens ("f1r" for "F1-R") if only one apartment fits.
  if v_unit is null and private.loose(p_unit) <> '' then
    select min(u.id::text)::uuid into v_unit
    from public.units u
    join public.buildings b on b.id = u.building_id
    where b.code = upper(trim(coalesce(p_code, ''))) and private.loose(u.label) = private.loose(p_unit)
    having count(*) = 1;
  end if;
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

-- Everything a resident may see: their own apartment, balance and statement.
-- Other apartments, the building's money and maintenance are never included.
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
    -- Always empty: only here so a phone still running an older copy of the app keeps working.
    -- A resident gets nothing about the building's money.
    'summary', '{}'::jsonb, 'ledger', '[]'::jsonb, 'months', '[]'::jsonb, 'maintenance', '[]'::jsonb
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

-- Table privileges for signed-in managers. The access rules below still decide which rows they get.
-- (Needed when the project was created with "Automatically expose new tables" turned off.)
grant select, insert, update, delete on public.units, public.entries, public.maintenance to authenticated;
grant select, delete on public.buildings to authenticated;
-- Managers may change a building's name, currency and opening balance, but not its code or owner.
revoke update on public.buildings from anon, authenticated;
grant update (name, currency, opening_cash) on public.buildings to authenticated;
revoke all on public.unit_access, public.resident_sessions, public.building_managers, public.backups from anon, authenticated;

-- Who may call what.
revoke execute on function public.create_building(text, int, int, numeric, text, boolean) from public, anon;
revoke execute on function public.relabel_units(uuid, boolean) from public, anon;
revoke execute on function public.set_unit_balance(uuid, numeric) from public, anon;
grant execute on function public.set_unit_balance(uuid, numeric) to authenticated;
revoke execute on function public.units_sync_due() from public, anon, authenticated;
revoke execute on function public.list_managers(uuid) from public, anon;
revoke execute on function public.add_manager(uuid, text) from public, anon;
revoke execute on function public.remove_manager(uuid, uuid) from public, anon;
grant execute on function public.relabel_units(uuid, boolean) to authenticated;
grant execute on function public.list_managers(uuid) to authenticated;
grant execute on function public.add_manager(uuid, text) to authenticated;
grant execute on function public.remove_manager(uuid, uuid) to authenticated;
grant execute on function public.is_owner(uuid) to anon, authenticated;
revoke execute on function public.backup_now(uuid) from public, anon;
revoke execute on function public.list_backups(uuid) from public, anon;
revoke execute on function public.get_backup(uuid) from public, anon;
revoke execute on function public.restore_backup(uuid, uuid, jsonb) from public, anon;
grant execute on function public.backup_now(uuid) to authenticated;
grant execute on function public.list_backups(uuid) to authenticated;
grant execute on function public.get_backup(uuid) to authenticated;
grant execute on function public.restore_backup(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.set_unit_password(uuid, text) from public, anon;
revoke execute on function public.reset_all_passwords(uuid) from public, anon;
revoke execute on function public.manager_overview(uuid) from public, anon;
grant execute on function public.create_building(text, int, int, numeric, text, boolean) to authenticated;
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
alter table public.building_managers enable row level security;
alter table public.backups enable row level security;

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
create policy "managers read their buildings" on public.buildings for select to authenticated
  using (public.is_manager(id));
create policy "managers edit their buildings" on public.buildings for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));
create policy "owner deletes building" on public.buildings for delete to authenticated
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

-- ---------------------------------------------------------------- security hardening (26 Nov 2026)
-- Helpers used by RLS policies: signed-in users only. Internal helpers: only called from trusted functions.
revoke execute on function public.is_manager(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.is_manager(uuid), public.is_owner(uuid) to authenticated, service_role;
revoke execute on function private.loose(text), private.unit_label(integer, integer, integer) from public, anon, authenticated;
alter function private.loose(text) set search_path = '';
alter function private.unit_label(integer, integer, integer) set search_path = '';
