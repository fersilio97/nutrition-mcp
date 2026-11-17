-- UX audit batch 1: water and sodium opt-ins, meal provenance, sodium, recipes.
-- Additive only. Apply with `supabase db push` BEFORE merging (merging deploys).

-- Water becomes an opt-in like alcohol. New accounts start with it off; anyone
-- who has ever logged water keeps it on so their view does not disappear.
alter table public.profiles
    add column if not exists water_tracking_enabled boolean not null default false,
    add column if not exists sodium_tracking_enabled boolean not null default false;

-- An upsert, not an update: profile rows only exist once a setting was written,
-- so a water logger may have none. Safe since 20260815071028 made timezone
-- nullable with no default, so the new row still reads as "timezone never set".
insert into public.profiles (user_id, water_tracking_enabled)
    select distinct w.user_id, true from public.water_log w
    on conflict (user_id) do update set water_tracking_enabled = true;

comment on column public.profiles.water_tracking_enabled is
    'Show water in goals, widgets and the dashboard. Display only; the export always includes water.';
comment on column public.profiles.sodium_tracking_enabled is
    'Show sodium in goals, widgets and the dashboard. Display only.';

-- Sodium per meal and as a daily limit; where a meal's figures came from.
alter table public.meals
    add column if not exists sodium_mg numeric(8,1) check (sodium_mg >= 0),
    add column if not exists source text
        check (source in ('label', 'chain', 'barcode', 'estimate', 'import', 'recipe'));

comment on column public.meals.source is
    'Provenance of the nutrition figures; NULL means not recorded (pre-feature rows).';

alter table public.nutrition_goals
    add column if not exists daily_sodium_mg numeric(8,1) check (daily_sodium_mg >= 0);

-- Saved recipes: per-serving figures, logged by name with a servings count.
create table if not exists public.recipes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 120),
    servings numeric(6,2) not null default 1 check (servings > 0),
    calories numeric(7,1) check (calories >= 0),
    protein_g numeric(6,1) check (protein_g >= 0),
    carbs_g numeric(6,1) check (carbs_g >= 0),
    fat_g numeric(6,1) check (fat_g >= 0),
    fiber_g numeric(6,1) check (fiber_g >= 0),
    sugar_g numeric(6,1) check (sugar_g >= 0),
    sodium_mg numeric(8,1) check (sodium_mg >= 0),
    caffeine_mg numeric(7,1) check (caffeine_mg >= 0),
    ingredients jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists recipes_user_name_key
    on public.recipes (user_id, lower(name));

comment on column public.recipes.servings is
    'How many servings the recipe makes; the nutrient columns are PER SERVING.';

alter table public.recipes enable row level security;
drop policy if exists "Users manage their own recipes" on public.recipes;
create policy "Users manage their own recipes"
    on public.recipes
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
