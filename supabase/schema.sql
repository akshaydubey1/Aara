-- Aara sync backend — run once in your Supabase project's SQL editor.
-- Region: pick Mumbai (ap-south-1) when creating the project so Indian mill
-- data stays in India (DPDP-friendly).
--
-- Model: one mill = one mill_id (the owner's user id). Members join via a
-- single-use invite code the owner generates in the app. Data rows are opaque
-- key/value documents per mill; row-level security walls each mill off.

create table if not exists public.mill_members (
  mill_id    text        not null,
  uid        text        not null,
  role       text        not null check (role in ('owner','partner','munshi')),
  created_at timestamptz not null default now(),
  primary key (mill_id, uid)
);

create table if not exists public.mill_data (
  mill_id    text        not null,
  key        text        not null,
  v          jsonb,
  t          bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (mill_id, key)
);

create table if not exists public.mill_invites (
  code       text        primary key,
  mill_id    text        not null,
  role       text        not null check (role in ('partner','munshi')),
  created_by text,
  created_at timestamptz not null default now(),
  expires    timestamptz not null default now() + interval '7 days',
  used_at    timestamptz
);

alter table public.mill_members enable row level security;
alter table public.mill_data enable row level security;
alter table public.mill_invites enable row level security;

-- SECURITY DEFINER helpers: read membership without tripping RLS recursion.
create or replace function public.is_mill_member(p_mill text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.mill_members
                where mill_id = p_mill and uid = auth.uid()::text)
$$;

create or replace function public.my_mill_role(p_mill text)
returns text language sql security definer stable set search_path = public as $$
  select role from public.mill_members
  where mill_id = p_mill and uid = auth.uid()::text limit 1
$$;

-- Members can read their own row and their mill's roster.
create policy "read own and mill roster" on public.mill_members
  for select to authenticated
  using (uid = auth.uid()::text or public.is_mill_member(mill_id));

-- A user may only self-create their own mill as owner. Everyone else joins
-- through join_mill() below — no direct inserts.
create policy "self-create own mill" on public.mill_members
  for insert to authenticated
  with check (uid = auth.uid()::text and mill_id = auth.uid()::text and role = 'owner');

-- A member can leave unless they are an owner (a mill always keeps its
-- owner); the owner can remove anyone else.
create policy "leave or owner removes" on public.mill_members
  for delete to authenticated
  using ((uid = auth.uid()::text and role <> 'owner')
         or (uid <> auth.uid()::text and public.my_mill_role(mill_id) = 'owner'));

-- Mill data: every member reads and writes; only owner/partner run real
-- deletes. (The app deletes via null-value tombstones — enforced in the
-- mill_data_guard trigger below, which is what actually gates munshis.)
create policy "members read" on public.mill_data
  for select to authenticated using (public.is_mill_member(mill_id));
create policy "members write" on public.mill_data
  for insert to authenticated with check (public.is_mill_member(mill_id));
create policy "members update" on public.mill_data
  for update to authenticated using (public.is_mill_member(mill_id));
create policy "owner and partner delete" on public.mill_data
  for delete to authenticated using (public.my_mill_role(mill_id) in ('owner','partner'));

-- Write guard: the server stamps every write with its own clock (phone
-- clocks cannot skew last-write-wins), and a munshi cannot tombstone
-- anything except their attendance marks, nor write mill settings (core_)
-- or people (per_) records — even with a hand-rolled client.
create or replace function public.mill_data_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.t := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if public.my_mill_role(new.mill_id) = 'munshi' then
    if new.v is null and new.key not like 'att\_%' escape '\' then
      raise exception 'munshi cannot delete records';
    end if;
    if new.v is not null and (new.key like 'core\_%' escape '\'
        or new.key like 'per\_%' escape '\' or new.key = 'accounts') then
      raise exception 'munshi cannot change this record';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mill_data_guard on public.mill_data;
create trigger mill_data_guard
  before insert or update on public.mill_data
  for each row execute function public.mill_data_guard();

-- Invites: only the owner sees and creates them.
create policy "owner manages invites" on public.mill_invites
  for all to authenticated
  using (public.my_mill_role(mill_id) = 'owner')
  with check (public.my_mill_role(mill_id) = 'owner');

-- Failed join attempts — written only by join_mill (definer); no client
-- access. Caps code guessing at 10 tries per user per hour.
create table if not exists public.mill_join_attempts (
  uid text not null,
  at timestamptz not null default now()
);
alter table public.mill_join_attempts enable row level security;

-- Join a mill with a single-use code. The UPDATE ... RETURNING makes
-- redemption atomic: two simultaneous joins cannot both consume one code.
-- Runs as definer so it can write the membership row; existing members
-- keep their role (an owner can never demote themselves by redeeming).
create or replace function public.join_mill(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.mill_join_attempts
      where uid = auth.uid()::text and at > now() - interval '1 hour') >= 10 then
    raise exception 'too many attempts — try again later';
  end if;
  update public.mill_invites set used_at = now()
    where code = p_code and used_at is null and expires > now()
    returning mill_id, role into r;
  if not found then
    insert into public.mill_join_attempts(uid) values (auth.uid()::text);
    raise exception 'invalid or expired invite code';
  end if;
  insert into public.mill_members(mill_id, uid, role)
    values (r.mill_id, auth.uid()::text, r.role)
    on conflict (mill_id, uid) do nothing;
  return r.mill_id;
end $$;

-- keep updated_at honest on upserts
create or replace function public.mill_data_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mill_data_touch on public.mill_data;
create trigger mill_data_touch
  before insert or update on public.mill_data
  for each row execute function public.mill_data_touch();
