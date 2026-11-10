-- WealthGenie: persisted financial goals
-- Each row is owned by exactly one authenticated Supabase user.

begin;

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null default 'Other' check (
    category in ('Security', 'Milestone', 'Retirement', 'Lifestyle', 'Other')
  ),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date date,
  description text check (
    description is null or char_length(description) <= 500
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists financial_goals_user_created_idx
  on public.financial_goals (user_id, created_at desc);

create index if not exists financial_goals_user_target_date_idx
  on public.financial_goals (user_id, target_date);

alter table public.financial_goals enable row level security;

drop policy if exists "financial_goals_select_own" on public.financial_goals;
create policy "financial_goals_select_own"
  on public.financial_goals for select
  using ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_insert_own" on public.financial_goals;
create policy "financial_goals_insert_own"
  on public.financial_goals for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_update_own" on public.financial_goals;
create policy "financial_goals_update_own"
  on public.financial_goals for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "financial_goals_delete_own" on public.financial_goals;
create policy "financial_goals_delete_own"
  on public.financial_goals for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists financial_goals_set_updated_at on public.financial_goals;
create trigger financial_goals_set_updated_at
  before update on public.financial_goals
  for each row execute function public.set_updated_at();

revoke all on public.financial_goals from anon;
grant select, insert, update, delete on public.financial_goals to authenticated;

commit;
