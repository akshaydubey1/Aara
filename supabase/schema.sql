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

-- Members can leave; the owner can remove anyone.
create policy "leave or owner removes" on public.mill_members
  for delete to authenticated
  using (uid = auth.uid()::text or public.my_mill_role(mill_id) = 'owner');

-- Mill data: every member reads and writes; only owner/partner delete.
create policy "members read" on public.mill_data
  for select to authenticated using (public.is_mill_member(mill_id));
create policy "members write" on public.mill_data
  for insert to authenticated with check (public.is_mill_member(mill_id));
create policy "members update" on public.mill_data
  for update to authenticated using (public.is_mill_member(mill_id));
create policy "owner and partner delete" on public.mill_data
  for delete to authenticated using (public.my_mill_role(mill_id) in ('owner','partner'));

-- Invites: only the owner sees and creates them.
create policy "owner manages invites" on public.mill_invites
  for all to authenticated
  using (public.my_mill_role(mill_id) = 'owner')
  with check (public.my_mill_role(mill_id) = 'owner');

-- Join a mill with a single-use code. Runs as definer so it can write the
-- membership and consume the invite atomically.
create or replace function public.join_mill(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from public.mill_invites
    where code = p_code and used_at is null and expires > now();
  if not found then raise exception 'invalid or expired invite code'; end if;
  insert into public.mill_members(mill_id, uid, role)
    values (r.mill_id, auth.uid()::text, r.role)
    on conflict (mill_id, uid) do update set role = excluded.role;
  update public.mill_invites set used_at = now() where code = p_code;
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
