-- WealthGenie: saved Financial Digital Twin scenarios
-- Each row is owned by exactly one authenticated Supabase user.
-- The optional baseline assessment reference is ownership-checked at the
-- database level through a composite foreign key on (id, user_id).

begin;

-- Required for the composite foreign key below. A unique index is sufficient
-- for PostgreSQL to accept the referenced column pair.
create unique index if not exists financial_assessments_id_user_idx
  on public.financial_assessments (id, user_id);

create table if not exists public.financial_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  baseline_assessment_id uuid,
  baseline_inputs jsonb not null check (jsonb_typeof(baseline_inputs) = 'object'),
  scenario_inputs jsonb not null check (jsonb_typeof(scenario_inputs) = 'object'),
  thresholds jsonb not null default '{}'::jsonb check (
    jsonb_typeof(thresholds) = 'object'
  ),
  as_of_date date not null default (timezone('utc', now()))::date,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financial_scenarios_baseline_owner_fkey
    foreign key (baseline_assessment_id, user_id)
    references public.financial_assessments (id, user_id)
    on delete set null (baseline_assessment_id)
);

create index if not exists financial_scenarios_user_updated_idx
  on public.financial_scenarios (user_id, updated_at desc);

create index if not exists financial_scenarios_baseline_idx
  on public.financial_scenarios (baseline_assessment_id);

alter table public.financial_scenarios enable row level security;

drop policy if exists "financial_scenarios_select_own" on public.financial_scenarios;
create policy "financial_scenarios_select_own"
  on public.financial_scenarios for select
  using ((select auth.uid()) = user_id);

drop policy if exists "financial_scenarios_insert_own" on public.financial_scenarios;
create policy "financial_scenarios_insert_own"
  on public.financial_scenarios for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_scenarios_update_own" on public.financial_scenarios;
create policy "financial_scenarios_update_own"
  on public.financial_scenarios for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_scenarios_delete_own" on public.financial_scenarios;
create policy "financial_scenarios_delete_own"
  on public.financial_scenarios for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists financial_scenarios_set_updated_at on public.financial_scenarios;
create trigger financial_scenarios_set_updated_at
  before update on public.financial_scenarios
  for each row execute function public.set_updated_at();

revoke all on public.financial_scenarios from anon;
grant select, insert, update, delete on public.financial_scenarios to authenticated;

commit;
