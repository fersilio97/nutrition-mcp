alter table public.meals add column if not exists items_label text;
comment on column public.meals.items_label is 'Optional recipe or dish name prefixed to the meal items description.';

alter table public.recipes add column if not exists ingredient_items jsonb;
comment on column public.recipes.ingredient_items is 'Measured ingredients and nutrients for the whole recipe batch.';
