-- Body details switch: leave unusual active days (a weekly long ride, a
-- near-zero rest day) out of the usual-active average the goal starts from.
-- Additive with a default, so code that does not know it keeps working.
alter table public.profiles
    add column if not exists active_outlier_filter boolean not null default false;

comment on column public.profiles.active_outlier_filter is
    'Leave days with |modified z| > 3.5 out of the usual-active average (goal-plan.ts activeOutliers).';
