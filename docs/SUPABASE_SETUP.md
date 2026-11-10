# Supabase Auth & Persistence Setup

WealthGenie uses Supabase Auth for email/password accounts and Postgres with
row-level security (RLS) for user data. This document covers applying the
database migrations and configuring the project.

## What is stored where

| Data | Table | Owner column |
| --- | --- | --- |
| Linked user profile | `public.profiles` | `id` = `auth.users.id` |
| Saved financial assessments | `public.financial_assessments` | `user_id` = `auth.users.id` |
| Saved financial goals | `public.financial_goals` | `user_id` = `auth.users.id` |
| Saved Digital Twin scenarios | `public.financial_scenarios` | `user_id` = `auth.users.id` |

Every table has RLS enabled with policies that compare `auth.uid()` to the
owner column. The browser never supplies an authoritative user id; the Express
backend verifies the Supabase access token and writes `user_id` from the
verified token.

## 1. Configure environment variables

Backend (`backend/.env`):

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
PORT=5001
```

Frontend (`frontend/.env.local`):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# Optional when not using the Vite proxy:
# VITE_API_BASE_URL=http://localhost:5001
```

Use the **publishable/anon** key only. Never put a service-role key in either
frontend or backend environment files. `.env`, `.env.local`, `backend/.env`,
and `frontend/.env.local` are git-ignored; `.env.example` files contain
placeholders only.

## 2. Apply the migrations

Migrations live in `supabase/migrations/` and must be applied in filename
order:

1. `20261027090000_profiles.sql`
2. `20261027090100_financial_assessments.sql`
3. `20261027090200_financial_goals.sql`
4. `20261027100000_financial_scenarios.sql`
5. `20261028120000_learning_progress.sql`

### Option A — Supabase CLI (recommended)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

The CLI needs an access token with permission to change the project schema
(for example `supabase login`). If you do not have those credentials, use the
dashboard option below.

### Option B — Supabase Dashboard SQL Editor

1. Open the project in the Supabase dashboard.
2. Go to **SQL Editor**.
3. Paste the full contents of each migration file, one at a time, in the order
   above, and run it.
4. Confirm the tables appear under **Table Editor**.

The first migration creates `public.set_updated_at()` and the
`public.handle_new_user()` trigger that inserts a `profiles` row whenever
Supabase Auth creates a user. The backend also creates a missing profile
lazily on `GET /api/profile`, so existing auth users are covered.

## 3. Configure Auth

In the Supabase dashboard:

1. **Authentication → Providers → Email**: ensure Email is enabled.
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173` for local development.
   - Redirect URLs: add `http://localhost:5173/**` and your production origin.
3. If email confirmation is enabled, signup returns no session until the user
   confirms their address. The UI shows a confirmation message and the app
   processes the confirmation redirect on return.
4. Google OAuth is intentionally not configured yet.

## 4. Verify RLS

After applying migrations, sign in as two different users and confirm:

- Each user sees only their own profile, assessments, goals, scenarios, and
  learning progress.
- Inserting a row with another user's `user_id` is rejected by the `with check`
  policy.
- Updating or deleting another user's row affects zero rows.
- `learning_progress` has one row per user (`user_id` primary key); the backend
  derives `user_id` from the verified JWT, never from the request body.
- A saved scenario can only reference a baseline assessment owned by the same
  user; the composite foreign key on `(baseline_assessment_id, user_id)`
  enforces this at the database level.

You can inspect policies in **Authentication → Policies** or with:

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 5. What has and has not been verified

The application code, migrations, middleware, validation, and frontend build
have been tested locally. Applying these migrations to a hosted Supabase
project and completing a real email signup/login round trip requires project
credentials that were not available in this environment, so hosted
end-to-end auth and persistence have **not** been claimed as verified here.
Follow the steps above, then run the app and check:

1. Sign up, confirm the email if required, and sign in.
2. Complete an assessment; confirm the row appears in
   `financial_assessments` with your `user_id`.
3. Create, edit, and delete a goal; confirm the rows change in
   `financial_goals`.
4. Adjust and save a Digital Twin scenario; confirm the row appears in
   `financial_scenarios` with your `user_id`. Load, rename, compare, and delete
   it again.
5. Open a Learn lesson, answer its quiz correctly, and complete the concept.
   Confirm the row appears in `learning_progress` with your `user_id` and the
   completed concept slug in `completed_concept_ids`.
6. Refresh the browser; the session and data should be restored.
7. Sign in as a second user; the first user's data must not be visible.
