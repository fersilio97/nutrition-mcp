// Weight-driven calorie goals: the pure maths, free of Supabase so it unit-tests
// with fixtures.
//
//   goal = (resting + active + rate × k) ÷ (1 − f)
//
// resting  the calibrated baseline when applied, else Mifflin BMR
// active   that day's watch kcal
// rate     g/day, negative = losing. A rate goal stores it; a date goal derives
//          it every day from the smoothed trend weight and the days left
// k        kcal per gram of scale-weight change (the calibration's own k, so
//          the two cancel — see body.ts)
// f        the share of intake that is burned digesting it. TEF scales with
//          intake, so I = R + A + f·I + Δ has the closed form above; with
//          rate 0 and f = TEF_FRACTION it is exactly breakEvenKcal.
//
// Safety limits are advisory: goalFlags() describes, it never changes a number.

import {
    KCAL_PER_GRAM,
    TEF_FRACTION,
    ageOn,
    healthyRangeG,
    weightSlope,
    type BodyDetails,
    type WeighIn,
} from "./body.js";
import { adjustGoalsForActivity } from "./activity.js";
import type { Calibration, EnergyDay, ModelParams } from "./calibration.js";
import type { DashboardDay } from "./dashboard-stats.js";
import type { BodySex, NutritionGoals } from "./supabase.js";

export type GoalMode = "fixed" | "burn" | "rate" | "date";
export type RatePeriod = "week" | "month" | "year";

export const G_PER_LB = 453.59237;
/** Days in each rate period; a month and a year are the calendar averages. */
export const DAYS_PER_PERIOD: Record<RatePeriod, number> = {
    week: 7,
    month: 365.25 / 12,
    year: 365.25,
};
/** Within this much of the target, a date goal counts as reached. */
export const REACHED_TOLERANCE_G = 500;
/** The newest weigh-in may be this many days old before the trend stops
 *  being extrapolated to today. */
const MAX_EXTRAPOLATE_DAYS = 7;
/** Fewest weigh-in days, and days of span, for a fitted trend to be used.
 *  Daily scale noise (±0.5–1 kg) over one week is enough to tilt a line by a
 *  kilo a week, so a line needs two weeks before it beats a plain average. */
const MIN_TREND_DAYS = 3;
export const MIN_TREND_SPAN = 14;
/** Days of weigh-ins the recent average uses, and the band of readings the
 *  fitted line must stay inside (see trendWeightToday). */
export const RECENT_DAYS = 7;
/** Fewest counted days before the user's own digestion share is trusted. */
const MIN_TEF_DAYS = 7;

function daysBetween(a: string, b: string): number {
    return Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
            86_400_000,
    );
}

/** A signed amount per week/month/year, in kg or lb, as grams per day. */
export function rateToGramsPerDay(
    amount: number,
    unit: "kg" | "lb",
    period: RatePeriod,
): number {
    const grams = unit === "lb" ? amount * G_PER_LB : amount * 1000;
    return grams / DAYS_PER_PERIOD[period];
}

/** grams per day back to an amount in a period and unit (for display). */
export function gramsPerDayToRate(
    gPerDay: number,
    unit: "kg" | "lb",
    period: RatePeriod,
): number {
    const perPeriod = gPerDay * DAYS_PER_PERIOD[period];
    return unit === "lb" ? perPeriod / G_PER_LB : perPeriod / 1000;
}

/** The stored mode, or for a legacy row (no mode) what its calorie number
 *  implies: a number is a fixed goal, none follows the estimated burn. */
export function resolveGoalMode(
    goals: {
        calorie_goal_mode?: GoalMode | null;
        daily_calories: number | null;
    } | null,
): GoalMode {
    if (goals?.calorie_goal_mode) return goals.calorie_goal_mode;
    return goals?.daily_calories != null && goals.daily_calories > 0
        ? "fixed"
        : "burn";
}

/** The share of intake the user burns digesting it: their own counted days'
 *  per-macro TEF over their intake. TEF_FRACTION until there are enough days. */
export function tefRatio(days: EnergyDay[]): number {
    const counted = days.filter((d) => d.counted && d.calories > 0);
    if (counted.length < MIN_TEF_DAYS) return TEF_FRACTION;
    const intake = counted.reduce((s, d) => s + d.calories, 0);
    const tef = counted.reduce((s, d) => s + d.tef_kcal, 0);
    const ratio = tef / intake;
    // A guard rail on odd macro data, not a physiological claim.
    return Math.min(0.2, Math.max(0.05, ratio));
}

export interface TrendWeight {
    weight_g: number;
    /** trend: least-squares fit extrapolated to today; recent_mean: the last
     *  seven days' weigh-ins averaged; latest: the newest single reading. */
    source: "trend" | "recent_mean" | "latest";
    /** The lookback the fit used, days. */
    window_days: number;
    /** Weigh-in days the figure rests on. */
    weighin_days: number;
    /** True when the fitted line ran outside the last week's readings and
     *  was pulled back to the nearest of them before extrapolating. */
    clamped: boolean;
}

function addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** The smoothed weight today. `weighIns` sorted ascending. Null with no
 *  weigh-in at all.
 *
 *  A least-squares line is least certain at its ends, so one high reading at
 *  the start of the window can tilt it until today's end sits below every
 *  real reading ("trend 81.0" for someone who never weighed under 81.2).
 *  Two guards: the line is used only once the weigh-ins span MIN_TREND_SPAN
 *  days, and its value on the newest weigh-in day is held within the range
 *  of the RECENT_DAYS of readings ending there. Extrapolation to today runs
 *  from that held point, so a genuine ongoing loss still carries forward. */
export function trendWeightToday(
    weighIns: WeighIn[],
    today: string,
    windowDays: number,
): TrendWeight | null {
    const usable = weighIns.filter((w) => w.date <= today);
    if (!usable.length) return null;
    const fromIso = addDays(today, -windowDays);
    const inWindow = usable.filter((w) => w.date >= fromIso);
    const slope = weightSlope(inWindow);
    if (
        slope &&
        slope.days >= MIN_TREND_DAYS &&
        slope.span_days >= MIN_TREND_SPAN
    ) {
        const last = slope.points.at(-1)!;
        // Same-day readings are already averaged in `points`.
        const bandFrom = addDays(last.date, -(RECENT_DAYS - 1));
        const band = slope.points
            .filter((p) => p.date >= bandFrom)
            .map((p) => p.weight_g);
        const anchor = Math.min(
            Math.max(...band),
            Math.max(Math.min(...band), last.fit_g),
        );
        const ahead = Math.min(
            MAX_EXTRAPOLATE_DAYS,
            Math.max(0, daysBetween(last.date, today)),
        );
        return {
            weight_g: Math.round(anchor + slope.g_per_day * ahead),
            source: "trend",
            window_days: windowDays,
            weighin_days: slope.days,
            clamped: anchor !== last.fit_g,
        };
    }
    // The RECENT_DAYS ending today, inclusive; a day with several readings
    // counts once, as it does in the fitted line.
    const recentFrom = addDays(today, -(RECENT_DAYS - 1));
    const recent = usable.filter((w) => w.date >= recentFrom);
    if (recent.length >= 2) {
        const byDay = new Map<string, number[]>();
        for (const w of recent) {
            const list = byDay.get(w.date) ?? [];
            list.push(w.weight_g);
            byDay.set(w.date, list);
        }
        const means = [...byDay.values()].map(
            (v) => v.reduce((a, b) => a + b, 0) / v.length,
        );
        const mean = means.reduce((a, b) => a + b, 0) / means.length;
        return {
            weight_g: Math.round(mean),
            source: "recent_mean",
            window_days: RECENT_DAYS,
            weighin_days: byDay.size,
            clamped: false,
        };
    }
    return {
        weight_g: usable.at(-1)!.weight_g,
        source: "latest",
        window_days: 0,
        weighin_days: 1,
        clamped: false,
    };
}

/** The intake that holds `rate` g/day of scale-weight change, kcal. A
 *  generalised breakEvenKcal: rate 0 and f = TEF_FRACTION give the same. */
export function goalKcal(
    restingKcal: number,
    activeKcal: number | null,
    rateGPerDay: number,
    kcalPerGram: number = KCAL_PER_GRAM,
    tefShare: number = TEF_FRACTION,
): number {
    return Math.round(
        (restingKcal + (activeKcal ?? 0) + rateGPerDay * kcalPerGram) /
            (1 - tefShare),
    );
}

/** Counted days with a watch figure needed before the average is trusted;
 *  with fewer, the goal falls back to the day's own (live) active kcal. */
export const MIN_ACTIVE_DAYS = 7;

/** The modified z-score beyond which a day's active kcal counts as unusual
 *  (Iglewicz and Hoaglin's usual cut-off). Agreed with the user 2026-11-21:
 *  a weekly long ride or hike, and a near-zero rest day, both leave. */
export const ACTIVE_OUTLIER_Z = 3.5;

/** Days whose active kcal is unusual for this set: |modified z| above
 *  ACTIVE_OUTLIER_Z, where modified z = 0.6745 × (active − median) ÷ MAD.
 *  The median and MAD are used rather than the mean and standard deviation
 *  because one big day a week inflates both of those enough to hide itself
 *  (z ≈ 2.4 for a 2,000 kcal ride among 350 kcal days). With a MAD of 0
 *  (half the days identical) nothing is dropped. */
export function activeOutliers<T extends { active_kcal: number | null }>(
    days: T[],
): Set<T> {
    const values = days.map((d) => d.active_kcal ?? 0);
    const med = median(values);
    const mad = median(values.map((v) => Math.abs(v - med)));
    const out = new Set<T>();
    if (mad === 0) return out;
    for (const d of days)
        if (
            Math.abs((0.6745 * ((d.active_kcal ?? 0) - med)) / mad) >
            ACTIVE_OUTLIER_Z
        )
            out.add(d);
    return out;
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The usual active kcal for `date` and the days left out of it. Null with
 *  fewer than MIN_ACTIVE_DAYS counted, synced days in the window. */
export function activeAverageDetail(
    energyDays: Array<{
        date: string;
        counted: boolean;
        active_kcal: number | null;
    }>,
    date: string,
    windowDays: number,
    dropOutliers = false,
): { kcal: number; dropped: string[] } | null {
    const from = shift(date, -windowDays);
    const days = energyDays.filter(
        (d) =>
            d.counted &&
            d.active_kcal != null &&
            d.date >= from &&
            d.date < date,
    );
    if (days.length < MIN_ACTIVE_DAYS) return null;
    const out = dropOutliers ? activeOutliers(days) : new Set<never>();
    const kept = days.filter((d) => !out.has(d));
    return {
        kcal: kept.reduce((s, d) => s + (d.active_kcal ?? 0), 0) / kept.length,
        dropped: days.filter((d) => out.has(d)).map((d) => d.date),
    };
}

/** Mean active kcal over the counted days of the `windowDays` before `date`
 *  (the day itself excluded, so a part-finished today never drags it), or
 *  null with fewer than MIN_ACTIVE_DAYS of them. Days the watch never synced
 *  are left out rather than read as 0, which would bias the mean low. With
 *  `dropOutliers` (the Body details switch), unusual days (activeOutliers)
 *  are left out of the mean too; they still count everywhere else. */
export function activeAverage(
    energyDays: Array<{
        date: string;
        counted: boolean;
        active_kcal: number | null;
    }>,
    date: string,
    windowDays: number,
    dropOutliers = false,
): number | null {
    return (
        activeAverageDetail(energyDays, date, windowDays, dropOutliers)?.kcal ??
        null
    );
}

/** The active kcal a day's goal is built on: the usual (the average) until
 *  the day has an active figure, then that figure, above or below the
 *  average (the user's rule, 2026-11-15: active syncs after a workout or at
 *  22:00, and the goal must be final by bedtime, so a light day lowers it).
 *  A 0 counts as "not synced yet" — a failed sync, almost never a day without
 *  moving. Without a trusted average, the day's own. */
export function goalActiveKcal(
    average: number | null,
    today: number | null,
): number {
    if (today != null && today > 0) return Math.round(today);
    return Math.round(average ?? 0);
}

export interface GoalSettings {
    mode: GoalMode;
    /** Signed g/day, for a rate goal. */
    rate_g_per_day: number | null;
    target_weight_g: number | null;
    target_date: string | null;
}

export interface RatePlan {
    mode: GoalMode;
    /** The rate in force today, g/day (0 for fixed/burn, or once reached). */
    rate_g_per_day: number;
    target_weight_g: number | null;
    target_date: string | null;
    /** Date goal only: days from today to the target date. */
    days_left: number | null;
    /** Date goal: within tolerance of the target (or past the date). */
    reached: boolean;
}

/** The rate in force today for a goal's settings and the trend weight. */
export function planRate(
    s: GoalSettings,
    trend: TrendWeight | null,
    today: string,
): RatePlan {
    const base: RatePlan = {
        mode: s.mode,
        rate_g_per_day: 0,
        target_weight_g: s.target_weight_g,
        target_date: s.target_date,
        days_left: null,
        reached: false,
    };
    if (s.mode === "rate") {
        return { ...base, rate_g_per_day: s.rate_g_per_day ?? 0 };
    }
    if (s.mode !== "date") return base;
    if (s.target_date == null || s.target_weight_g == null) return base;
    const daysLeft = daysBetween(today, s.target_date);
    if (trend == null) return { ...base, days_left: daysLeft };
    const diff = s.target_weight_g - trend.weight_g;
    if (daysLeft <= 0 || Math.abs(diff) <= REACHED_TOLERANCE_G) {
        return { ...base, days_left: daysLeft, reached: true };
    }
    return {
        ...base,
        days_left: daysLeft,
        rate_g_per_day: diff / daysLeft,
    };
}

export type FlagCode =
    | "fast_loss"
    | "fast_gain"
    | "big_deficit"
    | "low_intake"
    | "underweight_target"
    | "minor_loss"
    | "date_soon"
    | "date_far"
    | "date_passed"
    | "formula_basis"
    | "no_trend";

export interface GoalFlag {
    code: FlagCode;
    /** red: a rule of thumb is exceeded; info: the figure is less certain. */
    level: "red" | "info";
    message: string;
}

export interface FlagInput {
    plan: RatePlan;
    trend: TrendWeight | null;
    /** Resting burn the deficit is measured against (calibrated when applied). */
    restingKcal: number | null;
    /** The intake floor's anchor: the resting figure chosen in Body details,
     *  i.e. the calibrated baseline when calibration is applied, else the
     *  formula BMR. (Days with bad data are excluded from calibration on the
     *  Meals tab, which keeps the baseline clean.) */
    bmrKcal: number | null;
    /** A steady active-kcal figure (the window's mean), not a part-finished day. */
    activeKcal: number | null;
    /** The goal at that same steady active figure. */
    goalKcal: number | null;
    kcalPerGram: number;
    /** Digestion share of intake: total burn is (resting + active) ÷ (1 − it). */
    tefShare: number;
    sex: BodySex | null;
    age: number | null;
    heightCm: number | null;
    /** The resting figure is the calibrated baseline. */
    calibrated: boolean;
    today: string;
}

const LOSS_PCT_PER_WEEK = 0.01;
const LOSS_G_PER_WEEK = 1000;
const GAIN_PCT_PER_WEEK = 0.005;
const DEFICIT_SHARE = 0.25;
const DEFICIT_KCAL = 1000;
const FLOOR_FEMALE = 1200;
const FLOOR_MALE = 1500;
const DATE_MIN_DAYS = 21;
const DATE_MAX_DAYS = 730;

/** Conventional rules of thumb, not medical advice and not a limit: they
 *  describe a plan, they never change it. Only rate and date goals raise them. */
export function goalFlags(i: FlagInput): GoalFlag[] {
    const out: GoalFlag[] = [];
    const { plan } = i;
    if (plan.mode !== "rate" && plan.mode !== "date") return out;
    const w = i.trend?.weight_g ?? null;
    const perWeek = plan.rate_g_per_day * 7;
    if (plan.mode === "date" && plan.days_left != null) {
        if (plan.days_left <= 0)
            out.push({
                code: "date_passed",
                level: "red",
                message: "The target date has passed; the goal is break-even.",
            });
        else if (plan.days_left < DATE_MIN_DAYS)
            out.push({
                code: "date_soon",
                level: "red",
                message: `Only ${plan.days_left} days left: water swings dominate a short span.`,
            });
        else if (plan.days_left > DATE_MAX_DAYS)
            out.push({
                code: "date_far",
                level: "red",
                message:
                    "The target is over two years away; the daily rate will be tiny and the plan not a forecast.",
            });
    }
    if (perWeek < 0) {
        const lossG = -perWeek;
        if (
            lossG > LOSS_G_PER_WEEK ||
            (w != null && lossG > w * LOSS_PCT_PER_WEEK)
        )
            out.push({
                code: "fast_loss",
                level: "red",
                message: `Losing ${(lossG / 1000).toFixed(2)} kg/week is above the usual 1% of body weight (max 1 kg) per week.`,
            });
        if (i.age != null && i.age < 18)
            out.push({
                code: "minor_loss",
                level: "red",
                message: "A weight-loss goal is not advised under 18.",
            });
    } else if (perWeek > 0 && w != null && perWeek > w * GAIN_PCT_PER_WEEK) {
        out.push({
            code: "fast_gain",
            level: "red",
            message: `Gaining ${(perWeek / 1000).toFixed(2)} kg/week is above the usual 0.5% of body weight per week.`,
        });
    }
    const deficit = -plan.rate_g_per_day * i.kcalPerGram;
    // The deficit is an energy-balance deficit (total burn − intake), so the
    // 25% is taken of total burn including digestion: (resting + active) ÷ (1 − f),
    // which is also the break-even intake and what "Est. burn" shows.
    const burn =
        i.restingKcal == null
            ? 0
            : (i.restingKcal + (i.activeKcal ?? 0)) / (1 - i.tefShare);
    if (deficit > DEFICIT_KCAL || (burn > 0 && deficit > burn * DEFICIT_SHARE))
        out.push({
            code: "big_deficit",
            level: "red",
            message: `A ${Math.round(deficit).toLocaleString("en-US")} kcal/day deficit is above 25% of your total daily burn including digestion (or 1,000 kcal).`,
        });
    if (i.goalKcal != null && plan.rate_g_per_day < 0) {
        const floor = Math.max(
            i.bmrKcal ?? 0,
            i.sex === "male" ? FLOOR_MALE : FLOOR_FEMALE,
        );
        if (i.goalKcal < floor)
            out.push({
                code: "low_intake",
                level: "red",
                message: `${i.goalKcal.toLocaleString("en-US")} kcal is below ${Math.round(floor).toLocaleString("en-US")} kcal (your BMR or the usual minimum).`,
            });
    }
    if (plan.target_weight_g != null && i.heightCm != null) {
        const { min } = healthyRangeG(i.heightCm);
        if (plan.target_weight_g < min)
            out.push({
                code: "underweight_target",
                level: "red",
                message:
                    "The target weight is below a BMI of 18.5 for your height.",
            });
    }
    if (!i.calibrated)
        out.push({
            code: "formula_basis",
            level: "info",
            message:
                "Resting burn is the formula estimate, not calibrated to you, so the real deficit can differ.",
        });
    if (i.trend == null || i.trend.source === "latest")
        out.push({
            code: "no_trend",
            level: "info",
            message:
                "Not enough weigh-ins for a smoothed trend; the latest reading is used.",
        });
    return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The macro targets for a day under a derived calorie goal. The stored
 *  targets are for an inactive day at the planned rate (`baseKcal`, active 0);
 *  protein stays put and carbs and fat follow the day's calories, so a deficit
 *  or an active day never silently cuts protein. */
export function scaleDerivedMacros(
    macros: {
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
    },
    totalKcal: number,
    baseKcal: number,
): {
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
} {
    const factor = baseKcal > 0 ? totalKcal / baseKcal : 1;
    const scale = (v: number | null) => (v == null ? null : round1(v * factor));
    return {
        protein_g: macros.protein_g,
        carbs_g: scale(macros.carbs_g),
        fat_g: scale(macros.fat_g),
    };
}

export interface RecommendedRates {
    /** The fastest loss the rules of thumb allow, g/day (positive number;
     *  0 when none is advised, e.g. under 18). Null without body details. */
    max_loss_g_per_day: number | null;
    /** The fastest gain, g/day. Null without a trend weight. */
    max_gain_g_per_day: number | null;
    /** Each loss limit on its own, g/day (null when it cannot be worked
     *  out), so the page can list all of them and mark the binding one. */
    loss_limits: Partial<Record<LossLimit, number | null>>;
    /** Which loss limit is the tightest, or "minor" when no loss is advised. */
    loss_binding: LossLimit | "minor" | null;
    /** The steady active-kcal figure the deficit limits were worked out from. */
    active_ref_kcal: number;
    /** The intake floor itself, kcal: max(resting figure, 1,200 / 1,500), and
     *  whether the resting figure or the usual minimum set it. */
    intake_floor_kcal: number;
    intake_floor_source: "resting" | "minimum";
}

export type LossLimit =
    | "weekly_pct"
    | "weekly_kg"
    | "deficit_share"
    | "deficit_kcal"
    | "intake_floor";

/**
 * The fastest rates goalFlags would not flag, so the page can offer them. The
 * loss limit is the tightest of: 1% of trend weight per week, 1 kg per week,
 * 25% of burn (or 1000 kcal) as a deficit, and an intake that stays at or
 * above max(resting burn, 1200/1500 kcal). `activeKcal` should be a steady
 * reference (the window's mean), not a part-finished day.
 */
export function recommendedRates(i: {
    trendG: number | null;
    restingKcal: number | null;
    /** The intake floor's anchor: the resting figure chosen in Body details
     *  (calibrated baseline when applied, else formula BMR). */
    bmrKcal: number | null;
    activeKcal: number;
    kcalPerGram: number;
    tefShare: number;
    sex: BodySex | null;
    age: number | null;
}): RecommendedRates {
    // The usual unsupervised minimum; the BMR sets the floor when higher.
    const minimum = i.sex === "male" ? FLOOR_MALE : FLOOR_FEMALE;
    const limits: Partial<Record<LossLimit, number | null>> = {
        weekly_pct:
            i.trendG == null ? null : (i.trendG * LOSS_PCT_PER_WEEK) / 7,
        weekly_kg: LOSS_G_PER_WEEK / 7,
        deficit_share: null,
        deficit_kcal: null,
        intake_floor: null,
    };
    if (i.restingKcal != null) {
        const burn = i.restingKcal + i.activeKcal;
        const floor = Math.max(i.bmrKcal ?? 0, minimum);
        // d is the energy-balance deficit (total burn − intake). The 25% is
        // of total burn including digestion, (R + A) ÷ (1 − f); the 1,000
        // kcal cap is the same balance deficit with no gross-up.
        limits.deficit_share =
            (burn * DEFICIT_SHARE) / ((1 - i.tefShare) * i.kcalPerGram);
        limits.deficit_kcal = DEFICIT_KCAL / i.kcalPerGram;
        // goal = (burn − d) ÷ (1 − f) must stay ≥ floor.
        limits.intake_floor =
            Math.max(0, burn - floor * (1 - i.tefShare)) / i.kcalPerGram;
    }
    let loss: number | null = null;
    let binding: RecommendedRates["loss_binding"] = null;
    // Loss needs a burn to measure the deficit against.
    if (i.restingKcal != null) {
        for (const [code, g] of Object.entries(limits) as [
            LossLimit,
            number | null,
        ][]) {
            if (g != null && (loss == null || g < loss)) {
                loss = g;
                binding = code;
            }
        }
        if (i.age != null && i.age < 18) {
            loss = 0;
            binding = "minor";
        }
    }
    return {
        max_loss_g_per_day: loss,
        max_gain_g_per_day:
            i.trendG == null ? null : (i.trendG * GAIN_PCT_PER_WEEK) / 7,
        loss_limits: limits,
        loss_binding: binding,
        active_ref_kcal: Math.round(i.activeKcal),
        intake_floor_kcal: Math.round(Math.max(i.bmrKcal ?? 0, minimum)),
        intake_floor_source:
            (i.bmrKcal ?? 0) >= minimum ? "resting" : "minimum",
    };
}

/** Everything the page and the tools say about the plan behind today's goal. */
export interface GoalPlanView extends RatePlan {
    /** The fastest rates within the rules of thumb, for the form's hints. */
    limits: RecommendedRates;
    trend: TrendWeight | null;
    /** The share of intake burned digesting it that the goal grosses up by. */
    tef_share: number;
    kcal_per_gram: number;
    /** The lookback, in days, that the averages (active kcal, digestion
     *  share) and the trend weight are taken over. */
    window_days: number;
    /** Today's resting burn and whether it is the calibrated baseline. */
    resting_kcal: number | null;
    /** The formula BMR from the body details (the intake floor's anchor). */
    bmr_kcal: number | null;
    resting_basis: "calibrated" | "formula";
    /** Today's goal, kcal (resting + active + rate, grossed up). */
    goal_kcal: number | null;
    /** Today's usual active kcal (the lookback mean), or null with too few
     *  days; the goal starts from it in the morning. */
    active_avg_kcal: number | null;
    /** The active kcal today's goal is built on (goalActiveKcal). */
    goal_active_kcal: number | null;
    /** Whether goal_active_kcal is today's own figure or the average. */
    goal_active_source: "today" | "average";
    /** The Body details switch: unusual active days leave the average. */
    active_outlier_filter: boolean;
    /** Days left out of today's average by that switch, oldest first. */
    active_dropped_days: string[];
    flags: GoalFlag[];
}

export interface DeriveInput {
    /** Dashboard rows, oldest first, ending today; mutated in place. */
    rows: DashboardDay[];
    goals: NutritionGoals | null;
    weighIns: WeighIn[];
    energyDays: EnergyDay[];
    calibration: Calibration;
    body: BodyDetails;
    today: string;
    model: ModelParams;
    /** profiles.active_outlier_filter: leave unusual active days out of
     *  the usual-active average (activeOutliers). */
    dropActiveOutliers?: boolean;
}

function shift(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * Sets every row's goal from that day's resting burn and its goal active kcal
 * (goalActiveKcal: the usual active until the day has an active figure,
 * then that figure), and returns the plan for the page. A typed (fixed) goal is
 * that figure plus the same goal active, macros scaled as
 * adjustGoalsForActivity always has. The rate is today's, applied to every
 * row, so a date goal re-derives daily and history follows it. Each past row
 * uses the average of its own window, so "the day's goal" means the same
 * thing on every bar.
 */
export function applyDerivedGoals(i: DeriveInput): GoalPlanView {
    const mode = resolveGoalMode(i.goals);
    const k = i.model.kcalPerGram;
    const from = shift(i.today, -i.model.windowDays);
    const to = shift(i.today, -1);
    const f = tefRatio(
        i.energyDays.filter((d) => d.date >= from && d.date <= to),
    );
    const trend = trendWeightToday(i.weighIns, i.today, i.model.windowDays);
    const plan = planRate(
        {
            mode,
            rate_g_per_day: i.goals?.weight_rate_g_per_day ?? null,
            target_weight_g: i.goals?.target_weight_g ?? null,
            target_date: i.goals?.target_date ?? null,
        },
        trend,
        i.today,
    );
    for (const row of i.rows) {
        row.active_avg_kcal = activeAverage(
            i.energyDays,
            row.date,
            i.model.windowDays,
            i.dropActiveOutliers === true,
        );
        row.goal_active_kcal = goalActiveKcal(
            row.active_avg_kcal,
            row.active_kcal,
        );
    }
    if (mode === "fixed") {
        // buildDashboardDays added the day's own active; redo it with the
        // goal active so every mode follows the same rule.
        for (const row of i.rows) {
            const adj = adjustGoalsForActivity(i.goals, row.goal_active_kcal);
            if (!adj.goals?.daily_calories) continue;
            row.goal_calories = adj.goals.daily_calories;
            row.goal_protein_g = adj.goals.daily_protein_g || null;
            row.goal_carbs_g = adj.goals.daily_carbs_g || null;
            row.goal_fat_g = adj.goals.daily_fat_g || null;
        }
    } else {
        for (const row of i.rows) {
            if (row.bmr_kcal == null) continue;
            const total = goalKcal(
                row.bmr_kcal,
                row.goal_active_kcal ?? row.active_kcal,
                plan.rate_g_per_day,
                k,
                f,
            );
            const base = goalKcal(row.bmr_kcal, 0, plan.rate_g_per_day, k, f);
            const macros = scaleDerivedMacros(
                {
                    protein_g: i.goals?.daily_protein_g ?? null,
                    carbs_g: i.goals?.daily_carbs_g ?? null,
                    fat_g: i.goals?.daily_fat_g ?? null,
                },
                total,
                base,
            );
            row.goal_calories = total;
            row.goal_base_calories = base;
            row.goal_protein_g = macros.protein_g || null;
            row.goal_carbs_g = macros.carbs_g || null;
            row.goal_fat_g = macros.fat_g || null;
        }
    }
    const row = i.rows.find((r) => r.date === i.today);
    const calibrated = i.calibration.applied;
    const goalToday = mode === "fixed" ? null : (row?.goal_calories ?? null);
    // A steady active-kcal reference: the window's mean over counted days
    // (today's figure is partial until the day ends).
    // The same average the goal starts from, so a flag and the goal agree.
    const inWindow = i.energyDays.filter(
        (d) => d.counted && d.date >= from && d.date <= to,
    );
    const activeRef =
        row?.active_avg_kcal ??
        (inWindow.length
            ? inWindow.reduce((s, d) => s + (d.active_kcal ?? 0), 0) /
              inWindow.length
            : (row?.active_kcal ?? 0));
    const age = i.body.birth_date ? ageOn(i.body.birth_date, i.today) : null;
    // The formula BMR (for display) and the resting figure the user chose in
    // Body details (calibrated when applied), which both measures the deficit
    // and anchors the intake floor.
    const bmr = i.calibration.bmr_kcal ?? null;
    const floorBase = row?.bmr_kcal ?? bmr;
    const limits = recommendedRates({
        trendG: trend?.weight_g ?? null,
        restingKcal: row?.bmr_kcal ?? null,
        bmrKcal: floorBase,
        activeKcal: activeRef,
        kcalPerGram: k,
        tefShare: f,
        sex: i.body.sex,
        age,
    });
    // The goal at the same steady active figure as the limits, so a flag and
    // the recommended maximum cannot disagree (today's own active is partial).
    const steadyGoal =
        row?.bmr_kcal == null
            ? null
            : goalKcal(row.bmr_kcal, activeRef, plan.rate_g_per_day, k, f);
    return {
        ...plan,
        limits,
        trend,
        tef_share: f,
        kcal_per_gram: k,
        window_days: i.model.windowDays,
        resting_kcal: row?.bmr_kcal ?? null,
        bmr_kcal: bmr,
        resting_basis: calibrated ? "calibrated" : "formula",
        goal_kcal: goalToday,
        active_avg_kcal:
            row?.active_avg_kcal == null
                ? null
                : Math.round(row.active_avg_kcal),
        goal_active_kcal: row?.goal_active_kcal ?? null,
        active_outlier_filter: i.dropActiveOutliers === true,
        active_dropped_days:
            activeAverageDetail(
                i.energyDays,
                i.today,
                i.model.windowDays,
                i.dropActiveOutliers === true,
            )?.dropped ?? [],
        goal_active_source:
            row?.active_avg_kcal == null || (row?.active_kcal ?? 0) > 0
                ? "today"
                : "average",
        flags: goalFlags({
            plan,
            trend,
            restingKcal: row?.bmr_kcal ?? null,
            bmrKcal: floorBase,
            activeKcal: activeRef,
            goalKcal: mode === "fixed" ? null : steadyGoal,
            kcalPerGram: k,
            tefShare: f,
            sex: i.body.sex,
            age,
            heightCm: i.body.height_cm,
            calibrated,
            today: i.today,
        }),
    };
}
