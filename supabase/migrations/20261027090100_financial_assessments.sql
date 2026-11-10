-- WealthGenie: persisted financial assessments
-- Each row is owned by exactly one authenticated Supabase user.

begin;

create table if not exists public.financial_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_version text not null default '1.0.0',
  goal text not null check (char_length(btrim(goal)) between 1 and 80),
  monthly_income numeric(14, 2) not null check (monthly_income >= 0),
  monthly_expenses numeric(14, 2) not null check (monthly_expenses >= 0),
  accessible_savings numeric(14, 2) not null check (accessible_savings >= 0),
  emi_payments numeric(14, 2) not null default 0 check (emi_payments >= 0),
  emi_included_in_expenses boolean not null default true,
  monthly_savings_capacity numeric(14, 2) check (
    monthly_savings_capacity is null or monthly_savings_capacity >= 0
  ),
  target_amount numeric(14, 2) check (
    target_amount is null or target_amount >= 0
  ),
  current_goal_savings numeric(14, 2) not null default 0 check (
    current_goal_savings >= 0
  ),
  goal_timeline_months integer check (
    goal_timeline_months is null or goal_timeline_months > 0
  ),
  result jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists financial_assessments_user_created_idx
  on public.financial_assessments (user_id, created_at desc);

alter table public.financial_assessments enable row level security;

drop policy if exists "financial_assessments_select_own" on public.financial_assessments;
create policy "financial_assessments_select_own"
  on public.financial_assessments for select
  using ((select auth.uid()) = user_id);

drop policy if exists "financial_assessments_insert_own" on public.financial_assessments;
create policy "financial_assessments_insert_own"
  on public.financial_assessments for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_assessments_update_own" on public.financial_assessments;
create policy "financial_assessments_update_own"
  on public.financial_assessments for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_assessments_delete_own" on public.financial_assessments;
create policy "financial_assessments_delete_own"
  on public.financial_assessments for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists financial_assessments_set_updated_at on public.financial_assessments;
create trigger financial_assessments_set_updated_at
  before update on public.financial_assessments
  for each row execute function public.set_updated_at();

revoke all on public.financial_assessments from anon;
grant select, insert, update, delete on public.financial_assessments to authenticated;

commit;
