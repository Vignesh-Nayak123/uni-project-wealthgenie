-- WealthGenie: per-user learning progress
-- One row per authenticated Supabase user. Apply this migration manually in the
-- Supabase SQL editor or with `supabase db push`; it is not applied automatically.
--
-- The completed_concept_ids array stores roadmap concept slugs that the backend
-- has already validated. quiz_progress stores the best attempt per concept as
-- { "<conceptId>": { "correct": n, "total": n, "completed": bool, "updatedAt": iso } }.

begin;

create table if not exists public.learning_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  completed_concept_ids text[] not null default '{}'::text[]
    check (cardinality(completed_concept_ids) <= 64),
  quiz_progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quiz_progress) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists learning_progress_updated_at_idx
  on public.learning_progress (updated_at desc);

alter table public.learning_progress enable row level security;

drop policy if exists "learning_progress_select_own" on public.learning_progress;
create policy "learning_progress_select_own"
  on public.learning_progress for select
  using ((select auth.uid()) = user_id);

drop policy if exists "learning_progress_insert_own" on public.learning_progress;
create policy "learning_progress_insert_own"
  on public.learning_progress for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "learning_progress_update_own" on public.learning_progress;
create policy "learning_progress_update_own"
  on public.learning_progress for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "learning_progress_delete_own" on public.learning_progress;
create policy "learning_progress_delete_own"
  on public.learning_progress for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists learning_progress_set_updated_at on public.learning_progress;
create trigger learning_progress_set_updated_at
  before update on public.learning_progress
  for each row execute function public.set_updated_at();

revoke all on public.learning_progress from anon;
grant select, insert, update, delete on public.learning_progress to authenticated;

commit;
