-- Track Stripe's "cancel at period end" flag on the profile so the UI
-- can show "Canceled — ends X" while the subscription is still active
-- through the trial / paid window. Without this column, a canceled
-- subscription looks identical to an active one until the period
-- actually ends and the .deleted webhook fires.
alter table public.profiles
  add column if not exists cancel_at_period_end boolean not null default false;
