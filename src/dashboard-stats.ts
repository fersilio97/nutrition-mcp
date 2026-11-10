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
    KCAL_PER_GRAM,
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
    /** That day's resting burn (Mifflin-St Jeor BMR from the weight in effect
     *  that day — so it moves as weight does), or null without body data. */
    bmr_kcal: number | null;
    /** Estimated total burn (resting + active), or null without body data. */
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
            bmr_kcal: bmr,
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

export interface EstimateVsScale {
    /**
     * "ok": both sides are known. "no_weighins": fewer than two weigh-ins on
     * different dates inside the period. "no_estimate": the scale moved, but
     * no day in the span has an estimated balance (no body details, or no
     * meals logged), so there is nothing to compare it with.
     */
    status: "ok" | "no_weighins" | "no_estimate";
    first_date: string | null;
    last_date: string | null;
    /** last_date − first_date, in days. */
    span_days: number | null;
    /** Complete days in [first_date, last_date) that carry a balance_g. */
    covered_days: number | null;
    /** What the scale did: last − first weigh-in, grams. */
    actual_g: number | null;
    /** Sum of balance_g over the covered days only. */
    est_logged_g: number | null;
    /** est_logged_g × span ÷ covered, only when some days are uncovered. */
    est_scaled_g: number | null;
    /** actual − estimate (the scaled one when present, else the logged one). */
    gap_g: number | null;
    /**
     * gap × 7.7 ÷ span. POSITIVE means the burn estimate runs HIGH: the scale
     * lost less (or gained more) than predicted, so the real burn is lower.
     * REQUIREMENTS §4.11 writes the formula as −gap × 7.7 ÷ span but then
     * says "positive → runs high"; only the sign used here satisfies both
     * that sentence and its worked example, so the leading minus is a typo.
     */
    implied_kcal_per_day: number | null;
    /** True when span ≥ 14 days and ≥ 70% of it is covered — only then is the
     *  implied offset worth stating; shorter spans are water and glycogen. */
    calibrated: boolean;
}

const CALIBRATE_MIN_SPAN = 14;
const CALIBRATE_MIN_COVERAGE = 0.7;

function dayDiff(a: string, b: string): number {
    return Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
            86_400_000,
    );
}

/**
 * The estimated gain/loss over a period next to what the scale actually did.
 *
 * The span runs from the first to the last weigh-in inside [startDate,
 * endDate]. The estimate covers days first ≤ d < last: a morning weigh-in on
 * the last day precedes that day's eating, so that day belongs to the next
 * span. Only complete days count (never in_progress), and only days that have
 * a balance — an unlogged day is unknown, not a day of eating nothing.
 *
 * Every state returns the same complete literal, so the payload's shape never
 * depends on the data.
 */
export function buildEstimateVsScale(
    dayRows: Pick<DashboardDay, "date" | "balance_g" | "in_progress">[],
    weighIns: WeighIn[],
    startDate: string,
    endDate: string,
): EstimateVsScale {
    const empty: EstimateVsScale = {
        status: "no_weighins",
        first_date: null,
        last_date: null,
        span_days: null,
        covered_days: null,
        actual_g: null,
        est_logged_g: null,
        est_scaled_g: null,
        gap_g: null,
        implied_kcal_per_day: null,
        calibrated: false,
    };
    // Stable sort: same-day weigh-ins keep their logged order, so "first"
    // is the earliest reading and "last" the latest.
    const inside = weighIns
        .filter((w) => w.date >= startDate && w.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date));
    if (inside.length < 2) return empty;
    const first = inside[0]!;
    const last = inside[inside.length - 1]!;
    const span = dayDiff(first.date, last.date);
    if (span <= 0) return empty;

    const actual = last.weight_g - first.weight_g;
    let covered = 0;
    let est = 0;
    for (const r of dayRows) {
        if (r.date < first.date || r.date >= last.date) continue;
        if (r.in_progress || r.balance_g == null) continue;
        covered += 1;
        est += r.balance_g;
    }
    const base: EstimateVsScale = {
        ...empty,
        first_date: first.date,
        last_date: last.date,
        span_days: span,
        covered_days: covered,
        actual_g: actual,
    };
    if (covered === 0) return { ...base, status: "no_estimate" };

    const scaled = covered < span ? Math.round((est * span) / covered) : null;
    const gap = actual - (scaled ?? est);
    return {
        ...base,
        status: "ok",
        est_logged_g: est,
        est_scaled_g: scaled,
        gap_g: gap,
        implied_kcal_per_day: Math.round((gap * KCAL_PER_GRAM) / span),
        calibrated:
            span >= CALIBRATE_MIN_SPAN &&
            covered / span >= CALIBRATE_MIN_COVERAGE,
    };
}

/** The Today tab's two 7-day figures. Fixed window, never the chart range. */
export interface Last7 {
    /** today − 7: a weekly weigh-in on the same weekday still lands inside. */
    from: string;
    /** today. */
    to: string;
    /** The scale: last − first weigh-in in [from, to]; null with fewer than
     *  two weigh-ins on different dates. */
    weight_change_g: number | null;
    weight_first_date: string | null;
    weight_last_date: string | null;
    /** Sum of balance_g over the complete logged days in [from, today − 1]
     *  — the Trends "Net est. change" definition over a fixed week. Null when
     *  no such day has a balance. */
    est_net_g: number | null;
    /** How many complete days carried a balance (0–7). */
    est_days: number;
    /** Whether any day in the window has an estimated burn at all; false
     *  means body details are missing, not that nothing was eaten. */
    has_burn: boolean;
}

export const LAST7_DAYS = 7;

/**
 * `dayRows` must reach back to today − 7 (buildDashboardPayload widens its
 * internal window for this), so the figures do not depend on the range the
 * Trends tab happens to show.
 */
export function buildLast7(
    dayRows: Pick<
        DashboardDay,
        "date" | "balance_g" | "burn_kcal" | "in_progress"
    >[],
    weighIns: WeighIn[],
    today: string,
): Last7 {
    const from = shiftDay(today, -LAST7_DAYS);
    // The scale side is exactly the Estimate-vs-reality span logic.
    const scale = buildEstimateVsScale(dayRows, weighIns, from, today);
    const week = dayRows.filter(
        (r) => r.date >= from && r.date < today && !r.in_progress,
    );
    const logged = week.filter((r) => r.balance_g != null);
    return {
        from,
        to: today,
        weight_change_g: scale.actual_g,
        weight_first_date: scale.first_date,
        weight_last_date: scale.last_date,
        est_net_g: logged.length
            ? logged.reduce((a, r) => a + r.balance_g!, 0)
            : null,
        est_days: logged.length,
        has_burn: dayRows.some(
            (r) => r.date >= from && r.date <= today && r.burn_kcal != null,
        ),
    };
}

function shiftDay(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
