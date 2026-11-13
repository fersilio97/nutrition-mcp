-- Per-day calibration choice, replacing calibration_skipped_days. A day now
-- counts automatically when breakfast, lunch and dinner are logged; a row here
-- overrides that either way (counted = true forces it in, false keeps it out).
-- No row = automatic.

create table if not exists public.calibration_day_overrides (
    user_id uuid not null references auth.users(id) on delete cascade,
    day date not null,
    counted boolean not null,
    primary key (user_id, day)
);

alter table public.calibration_day_overrides enable row level security;
drop policy if exists "Users manage their own calibration_day_overrides"
    on public.calibration_day_overrides;
create policy "Users manage their own calibration_day_overrides"
    on public.calibration_day_overrides
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Carry any existing skips over as explicit exclusions, then retire the table.
insert into public.calibration_day_overrides (user_id, day, counted)
select user_id, day, false from public.calibration_skipped_days
on conflict (user_id, day) do nothing;

drop table if exists public.calibration_skipped_days;
