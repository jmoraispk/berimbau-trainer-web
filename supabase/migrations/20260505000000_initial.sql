-- Berimbau Pro — initial schema.
--
-- Tables
--   profiles  one row per signed-in user; carries display name and the
--             "anonymous" preference that hides the name on the public
--             leaderboard view. Row id mirrors auth.users.id.
--   sessions  one row per completed practice session. user_id is the
--             foreign key to auth.users (cascade-deletes on account
--             deletion).
--
-- Views
--   leaderboard_view   per-user aggregates the leaderboard UI reads
--                      from. Display name redacts to NULL for users in
--                      anonymous mode.
--
-- RLS
--   Each user reads/writes own profile + sessions only. The
--   leaderboard_view is publicly readable.
--
-- Helpers
--   handle_new_user trigger    auto-creates a profile row on signup.
--   delete_my_account RPC      lets a user delete their own auth row,
--                              cascading the rest. Avoids needing the
--                              service role key on the client.

-- ── tables ─────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  anonymous    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  toque_name          text not null,
  bpm                 int not null,
  started_at          timestamptz not null,
  ended_at            timestamptz not null,
  elapsed_sec         real not null,
  total_scored_beats  int not null,
  accuracy            real not null,
  best_streak         int not null default 0,
  outcome_counts      jsonb,
  per_sound           jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists sessions_user_idx     on public.sessions (user_id);
create index if not exists sessions_ended_at_idx on public.sessions (ended_at desc);
create index if not exists sessions_toque_idx    on public.sessions (toque_name);

-- ── row-level security ────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "sessions_select_own" on public.sessions
  for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions
  for insert with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.sessions
  for delete using (auth.uid() = user_id);

-- ── new-user bootstrap ────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── leaderboard view ──────────────────────────────────────────────
--
-- Aggregates per (user, day, toque). The leaderboard UI groups further
-- by metric + window on the client side. Display name is NULLed for
-- users with anonymous = true; the consumer renders 'Anonymous' for
-- those rows.

create or replace view public.leaderboard_view as
select
  s.user_id,
  case when p.anonymous then null else p.display_name end as display_name,
  s.toque_name,
  date_trunc('day', s.ended_at) as day,
  count(*)                         as session_count,
  sum(s.elapsed_sec) / 60.0        as minutes,
  sum(s.total_scored_beats)        as beats,
  max(s.accuracy)                  as best_accuracy,
  avg(s.accuracy)                  as avg_accuracy
from public.sessions s
join public.profiles p on p.id = s.user_id
group by s.user_id, p.anonymous, p.display_name, s.toque_name, date_trunc('day', s.ended_at);

grant select on public.leaderboard_view to anon, authenticated;

-- ── account deletion ──────────────────────────────────────────────
--
-- Users can wipe their own data via the existing DELETE RLS policy on
-- sessions. To delete the auth row itself (cascading the rest), call
-- this RPC — security definer lets the function reach into auth.users
-- without exposing the service role to the browser.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

-- ── house-keeping ─────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
