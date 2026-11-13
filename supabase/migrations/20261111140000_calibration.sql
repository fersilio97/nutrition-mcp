alter table public.profiles
    add column if not exists resting_basis text not null default 'formula'
        check (resting_basis in ('formula', 'calibrated'));

create table if not exists public.calibration_skipped_days (
    user_id uuid not null references auth.users(id) on delete cascade,
    day date not null,
    primary key (user_id, day)
);

alter table public.calibration_skipped_days enable row level security;
drop policy if exists "Users manage their own calibration_skipped_days"
    on public.calibration_skipped_days;
create policy "Users manage their own calibration_skipped_days"
    on public.calibration_skipped_days
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
