-- Active energy burned per local calendar day, as reported by a wearable via
-- Apple Health (an iOS Shortcut POSTs to /api/activity) or logged by hand with
-- log_active_calories. Each day's figure is a cumulative total, so the row is
-- keyed by (user_id, date) and every sync overwrites it: a Shortcut that runs
-- hourly must not add the morning's burn to itself. `date` is the user's local
-- day (profiles.timezone), the same bucketing every read path uses.
create table if not exists public.activity_log (
    user_id uuid not null references auth.users(id) on delete cascade,
    date date not null,
    active_kcal integer not null check (active_kcal >= 0),
    source text,
    updated_at timestamptz not null default now(),
    primary key (user_id, date)
);

alter table public.activity_log enable row level security;

-- Re-runnable: this migration was first applied by hand (SQL editor) on the
-- production project, so `supabase db push` later met an existing policy.
-- Postgres has no `create policy if not exists`; drop-then-create is the
-- idempotent form, and it runs inside the migration's transaction, so the
-- table is never left without its policy.
drop policy if exists "Users manage their own activity_log"
    on public.activity_log;
create policy "Users manage their own activity_log"
    on public.activity_log
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- One long-lived, revocable ingest credential per user for /api/activity.
-- OAuth access tokens expire after 30 days, which would silently break a phone
-- automation nobody looks at; this one lives until setup_activity_sync rotates
-- it. Stored as a SHA-256 digest like oauth_tokens. Service-role only: RLS on,
-- no policy, exactly as oauth_tokens / patreon_tokens.
create table if not exists public.ingest_tokens (
    user_id uuid primary key references auth.users(id) on delete cascade,
    token_hash text not null unique,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
);

alter table public.ingest_tokens enable row level security;

grant all on table public.ingest_tokens to service_role;
