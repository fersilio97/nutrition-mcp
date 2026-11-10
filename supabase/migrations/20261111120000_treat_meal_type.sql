-- A fifth meal type, "treat": party food, a pizza night, dessert, drinks out.
-- Filing those as "dinner" or "snack" skews the meal-pattern stats, so they
-- get their own slot. Must be applied BEFORE the code that sends "treat"
-- ships, or every such insert fails this CHECK constraint.
--
-- Idempotent: drop-if-exists then re-add, so re-running it is harmless. The
-- list must match MEAL_TYPE_VALUES in src/import.ts.
alter table public.meals
    drop constraint if exists meals_meal_type_check;

alter table public.meals
    add constraint meals_meal_type_check
        check (meal_type = any (array['breakfast', 'lunch', 'dinner', 'snack', 'treat']));
