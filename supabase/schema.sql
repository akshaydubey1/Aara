-- Aara sync backend — run once in your Supabase project's SQL editor.
-- One table, keyed documents per user, row-level security so each signed-in
-- user can only read and write their own rows. Auth is handled by Supabase
-- GoTrue (email OTP works out of the box; phone OTP needs an SMS provider
-- configured in Authentication → Providers → Phone).

create table if not exists public.mill_data (
  uid        text        not null,
  key        text        not null,
  v          jsonb,
  t          bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uid, key)
);

alter table public.mill_data enable row level security;

create policy "users manage their own rows"
  on public.mill_data
  for all
  to authenticated
  using (uid = auth.uid()::text)
  with check (uid = auth.uid()::text);

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
