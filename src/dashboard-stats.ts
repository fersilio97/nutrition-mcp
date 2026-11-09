// The dashboard's derived figures — per-day goals, burn and balance, and the
// weight-tracker stats. Pure (no Supabase) so it tests with fixtures; the
// routes in src/dashboard.ts only fetch and hand rows in.
//
// Per-day goals go through adjustGoalsForActivity, the same function every MCP
// progress tool uses, so the dashboard's "goal 1,805" and the assistant's
// "goal 1,805" cannot disagree.

import { adjustGoalsForActivity } from "./activity.js";
import {
    bmi,
    bmiCategory,
    bmrFor,
    balanceGrams,
    dailyBurn,
    healthyRangeG,
    projectTargetDate,
    weightOn,
    weightTrend,
    ageOn,
    type BmiCategory,
    type BodyDetails,
    type WeighIn,
} from "./body.js";
import type { DailyBucket } from "./insights.js";
import type { NutritionGoals } from "./supabase.js";

export interface DashboardDay {
    date: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    waterMl: number;
    mealCount: number;
    /** Active kcal recorded for the day, or null. */
    active_kcal: number | null;
    /** The day's effective calorie goal (baseline + active), or null. */
    goal_calories: number | null;
    goal_protein_g: number | null;
    goal_carbs_g: number | null;
    goal_fat_g: number | null;
    /** Estimated total burn (BMR × 1.2 + active), or null without body data. */
    burn_kcal: number | null;
    /** Estimated grams gained (+) / lost (−). Null on a day with no meals —
     *  an unlogged day is unknown, not a day of eating nothing. */
    balance_g: number | null;
    /** True for today: the day is still running, so its balance is partial. */
    in_progress: boolean;
}

export function buildDashboardDays(
    buckets: DailyBucket[],
    activeByDate: Map<string, number>,
    goals: NutritionGoals | null,
    body: BodyDetails,
    weighIns: WeighIn[],
    today: string,
): DashboardDay[] {
    return buckets.map((b) => {
        const active = activeByDate.get(b.date) ?? null;
        const adj = adjustGoalsForActivity(goals, active);
        const g = adj.goals;
        const bmr = bmrFor(body, weightOn(weighIns, b.date), b.date);
        const burn = bmr == null ? null : dailyBurn(bmr, active);
        return {
            date: b.date,
            calories: b.calories,
            protein_g: b.protein_g,
            carbs_g: b.carbs_g,
            fat_g: b.fat_g,
            fiber_g: b.fiber_g,
            sugar_g: b.sugar_g,
            waterMl: b.waterMl,
            mealCount: b.meals.length,
            active_kcal: active,
            goal_calories: g?.daily_calories || null,
            goal_protein_g: g?.daily_protein_g || null,
            goal_carbs_g: g?.daily_carbs_g || null,
            goal_fat_g: g?.daily_fat_g || null,
            burn_kcal: burn,
            balance_g:
                burn != null && b.meals.length > 0
                    ? balanceGrams(b.calories, burn)
                    : null,
            in_progress: b.date === today,
        };
    });
}

export interface WeightStats {
    latest_g: number | null;
    latest_date: string | null;
    height_cm: number | null;
    age: number | null;
    bmi: number | null;
    bmi_category: BmiCategory | null;
    healthy_min_g: number | null;
    healthy_max_g: number | null;
    change_g: number | null;
    weekly_rate_g: number | null;
    trend_days: number | null;
    target_g: number | null;
    to_target_g: number | null;
    projected_date: string | null;
    bmr_kcal: number | null;
    /** Today's estimated burn including today's active kcal. */
    burn_today_kcal: number | null;
    /** Which details are missing, so the page can ask for exactly those. */
    missing: Array<"height" | "birth_date" | "sex" | "weight">;
}

/**
 * `trendWeighIns` is the window the rate is measured over (sorted ascending);
 * `latest` is the most recent weigh-in overall, which may predate it.
 */
export function buildWeightStats(
    trendWeighIns: WeighIn[],
    latest: WeighIn | null,
    body: BodyDetails,
    goals: NutritionGoals | null,
    todayActiveKcal: number | null,
    today: string,
): WeightStats {
    const missing: WeightStats["missing"] = [];
    if (body.height_cm == null) missing.push("height");
    if (body.birth_date == null) missing.push("birth_date");
    if (body.sex == null) missing.push("sex");
    if (!latest) missing.push("weight");

    const trend = weightTrend(trendWeighIns);
    const target = goals?.target_weight_g ?? null;
    const bmiValue =
        latest && body.height_cm != null
            ? bmi(latest.weight_g, body.height_cm)
            : null;
    const range = body.height_cm != null ? healthyRangeG(body.height_cm) : null;
    const bmr = bmrFor(body, latest?.weight_g ?? null, today);

    return {
        latest_g: latest?.weight_g ?? null,
        latest_date: latest?.date ?? null,
        height_cm: body.height_cm,
        age: body.birth_date ? ageOn(body.birth_date, today) : null,
        bmi: bmiValue,
        bmi_category: bmiValue == null ? null : bmiCategory(bmiValue),
        healthy_min_g: range?.min ?? null,
        healthy_max_g: range?.max ?? null,
        change_g: trend?.change_g ?? null,
        weekly_rate_g: trend?.weekly_rate_g ?? null,
        trend_days: trend?.span_days ?? null,
        target_g: target,
        to_target_g: latest && target != null ? target - latest.weight_g : null,
        projected_date:
            latest && target != null && trend
                ? projectTargetDate(latest, target, trend.weekly_rate_g)
                : null,
        bmr_kcal: bmr,
        burn_today_kcal: bmr == null ? null : dailyBurn(bmr, todayActiveKcal),
        missing,
    };
}
