-- WealthGenie: per-user Practice Trading (paper trading) state
-- One row per authenticated Supabase user. Apply this migration manually in the
-- Supabase SQL editor or with `supabase db push`; it is not applied automatically.
--
-- Replaces the old JSON files on the backend's disk, which free hosts wipe on
-- every restart or redeploy.
--
--   cash            virtual cash in rupees (starts at 1,00,000)
--   holdings        { "<SYMBOL>": { "quantity": n, "avgCost": n, "name": "..." } }
--   history         [ { "type": "BUY"|"SELL", "symbol": "...", ... }, ... ]
--   replay_session  compact historical-replay cursor, or null when none started:
--                   { "instrument", "source", "currentIndex", "status", "startedAt" }

begin;

create table if not exists public.paper_trading_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cash numeric(14, 2) not null default 100000
    check (cash >= 0),
  holdings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(holdings) = 'object'),
  history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(history) = 'array'),
  replay_session jsonb
    check (replay_session is null or jsonb_typeof(replay_session) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.paper_trading_accounts enable row level security;

drop policy if exists "paper_trading_accounts_select_own" on public.paper_trading_accounts;
create policy "paper_trading_accounts_select_own"
  on public.paper_trading_accounts for select
  using ((select auth.uid()) = user_id);

drop policy if exists "paper_trading_accounts_insert_own" on public.paper_trading_accounts;
create policy "paper_trading_accounts_insert_own"
  on public.paper_trading_accounts for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "paper_trading_accounts_update_own" on public.paper_trading_accounts;
create policy "paper_trading_accounts_update_own"
  on public.paper_trading_accounts for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "paper_trading_accounts_delete_own" on public.paper_trading_accounts;
create policy "paper_trading_accounts_delete_own"
  on public.paper_trading_accounts for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists paper_trading_accounts_set_updated_at on public.paper_trading_accounts;
create trigger paper_trading_accounts_set_updated_at
  before update on public.paper_trading_accounts
  for each row execute function public.set_updated_at();

revoke all on public.paper_trading_accounts from anon;
grant select, insert, update, delete on public.paper_trading_accounts to authenticated;

commit;
