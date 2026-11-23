alter table public.meals add column if not exists items jsonb;

comment on column public.meals.items is 'Per-food breakdown for a meal; meal totals are derived from these items.';
