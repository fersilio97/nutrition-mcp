-- What the red part of the Today tab's "Last 7 days" bars measures, chosen
-- with the segmented control above the chart and kept across devices.
--   surplus: eaten above the estimated burn (the default, NULL)
--   goal:    eaten above the day's calorie goal
alter table public.profiles
    add column if not exists week_chart_mode text
        check (week_chart_mode in ('surplus', 'goal'));

comment on column public.profiles.week_chart_mode is
    'Last 7 days chart: red = eaten over est. burn (surplus, NULL) or over goal (goal).';
