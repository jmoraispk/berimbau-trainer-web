-- Add subscription tracking to profiles.
--
-- Tiers
--   'free'         signed-in but no active subscription. The default for
--                  every new profile.
--   'early_access' active Stripe subscription (monthly or annual). Today
--                  this unlocks nothing extra — every feature is free for
--                  free-tier users while we're still building. Once we
--                  start paywalling features, the gates will check this
--                  column.
--
-- Stripe identifiers are stored on the profile row directly. One Stripe
-- customer per user, one subscription at a time. If we ever sell add-ons
-- or multiple SKUs, we'll factor this into its own subscriptions table.
--
-- All columns nullable / defaulted so existing rows survive the migration
-- without a data backfill.

alter table public.profiles
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'early_access')),
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz;

-- The leaderboard view needs the tier so the UI can flag paying users
-- with a pip. Anonymous-flagged users still get their name redacted
-- there — tier is fine to expose either way.
-- New columns must be APPENDED on `create or replace view` — Postgres
-- rejects the call if the prefix changes shape. Hence `tier` last,
-- not next to display_name.
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
  avg(s.accuracy)                  as avg_accuracy,
  p.tier
from public.sessions s
join public.profiles p on p.id = s.user_id
group by s.user_id, p.anonymous, p.display_name, p.tier, s.toque_name, date_trunc('day', s.ended_at);

grant select on public.leaderboard_view to anon, authenticated;
