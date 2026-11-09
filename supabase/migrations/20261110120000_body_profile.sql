-- Body details for BMI and the resting-energy estimate on the dashboard
-- (src/body.ts). All nullable with no default: NULL means "never given", and
-- every reader skips the stat that needs it rather than guessing a height or
-- an age. Set with the set_body_profile tool or the dashboard's Body form.
alter table public.profiles
    add column if not exists height_cm numeric(5,1)
        check (height_cm is null or (height_cm >= 50 and height_cm <= 272));

-- A date rather than an age so the estimate does not go stale on a birthday.
alter table public.profiles
    add column if not exists birth_date date
        check (birth_date is null or birth_date >= date '1900-01-01');

-- Only used for the Mifflin-St Jeor constant (+5 / -161), which is all the
-- equation distinguishes; it is not shown anywhere else.
alter table public.profiles
    add column if not exists sex text
        check (sex is null or sex in ('male', 'female'));
