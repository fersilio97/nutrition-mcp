// Body metrics for the dashboard and set_body_profile. Pure: no Supabase, so it
// unit-tests with fixtures (the activity.ts / insights.ts convention).
//
// Every figure here is an ESTIMATE and is labelled as one wherever it is shown:
//
//   BMR     Mifflin-St Jeor (1990) — the equation the Academy of Nutrition and
//           Dietetics found most accurate of the common ones for adults.
//   Burn    BMR + that day's active kcal from the wearable (BASE_FACTOR = 1).
//           The resting burn is the base, not BMR × 1.2: the user works
//           remotely and on non-workout days often walks under 1,000 steps,
//           so the "sedentary" 1.2 multiplier credited ~350 kcal/day of
//           movement that never happened — and whatever movement does happen
//           is already in the watch's active kcal, so a multiplier would
//           count it twice. Resting + active is also exactly how Garmin
//           splits its own total. If this runs LOW (the scale keeps losing
//           more than predicted), the dashboard's "Estimate vs reality" card
//           shows it as a negative kcal/day offset — that card, not a guessed
//           multiplier, is how to calibrate.
//   TEF     + 10% of that day's logged kcal: the thermic effect of food
//           (Westerterp 2004, ~10% on a mixed diet). Mifflin predicts a FASTING
//           resting rate and the watch's active kcal excludes it, so without
//           this term the burn ran ~150-250 kcal/day low.
//   Balance (eaten − burned) ÷ 6.0 kcal per gram. Not the classic 7.7 (pure
//           adipose): over 2-4 weeks a change in scale weight is fat, lean
//           tissue, water and glycogen together, measured at ~5-6.6 kcal/g
//           (Hall 2008; CALERIE). Day-to-day scale weight swings far more than
//           this (water, glycogen, salt), which is why it is a trend aid, not a
//           prediction of tomorrow's weigh-in.

import type { BodySex } from "./supabase.js";

/** Multiplier on BMR for the day's base burn. 1 = resting only; see above. */
export const BASE_FACTOR = 1.0;
/** kcal per gram of short-window (2-4 week) scale-weight change. */
export const KCAL_PER_GRAM = 6.0;
/** Thermic effect of food, as a share of the day's logged kcal. */
export const TEF_FRACTION = 0.1;
export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 272;
const BMI_HEALTHY_LOW = 18.5;
const BMI_HEALTHY_HIGH = 24.9;

export interface BodyDetails {
    height_cm: number | null;
    birth_date: string | null;
    sex: BodySex | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD day. */
export function ageOn(birthDate: string, onDate: string): number {
    const [by, bm, bd] = birthDate.split("-").map(Number) as [
        number,
        number,
        number,
    ];
    const [y, m, d] = onDate.split("-").map(Number) as [number, number, number];
    let age = y - by;
    if (m < bm || (m === bm && d < bd)) age -= 1;
    return age;
}

/** kg / m², one decimal. */
export function bmi(weightG: number, heightCm: number): number {
    const m = heightCm / 100;
    return round1(weightG / 1000 / (m * m));
}

export type BmiCategory = "underweight" | "healthy" | "overweight" | "obese";

/** WHO adult cut-offs. */
export function bmiCategory(value: number): BmiCategory {
    if (value < BMI_HEALTHY_LOW) return "underweight";
    if (value < 25) return "healthy";
    if (value < 30) return "overweight";
    return "obese";
}

/** The weight range (grams) that gives a BMI of 18.5–24.9 at this height. */
export function healthyRangeG(heightCm: number): { min: number; max: number } {
    const m2 = (heightCm / 100) ** 2;
    return {
        min: Math.round(BMI_HEALTHY_LOW * m2 * 1000),
        max: Math.round(BMI_HEALTHY_HIGH * m2 * 1000),
    };
}

/** Mifflin-St Jeor resting energy, kcal/day, rounded. */
export function bmrMifflin(
    weightG: number,
    heightCm: number,
    age: number,
    sex: BodySex,
): number {
    const base = 10 * (weightG / 1000) + 6.25 * heightCm - 5 * age;
    return Math.round(base + (sex === "male" ? 5 : -161));
}

/** Estimated total burn for a day: resting (BMR × BASE_FACTOR) + active kcal
 *  + the thermic effect of the kcal eaten (TEF_FRACTION of them). */
export function dailyBurn(
    bmr: number,
    activeKcal: number | null,
    eatenKcal = 0,
): number {
    return Math.round(
        bmr * BASE_FACTOR + (activeKcal ?? 0) + TEF_FRACTION * eatenKcal,
    );
}

/** Estimated grams gained (+) or lost (−) for a day's energy balance. */
export function balanceGrams(eatenKcal: number, burnKcal: number): number {
    return Math.round((eatenKcal - burnKcal) / KCAL_PER_GRAM);
}

/** BMR needs all three details plus a weight; null when any is missing. */
export function bmrFor(
    body: BodyDetails,
    weightG: number | null,
    onDate: string,
): number | null {
    if (
        weightG == null ||
        body.height_cm == null ||
        body.birth_date == null ||
        body.sex == null
    )
        return null;
    return bmrMifflin(
        weightG,
        body.height_cm,
        ageOn(body.birth_date, onDate),
        body.sex,
    );
}

export interface WeighIn {
    date: string; // local YYYY-MM-DD
    weight_g: number;
}

/**
 * The weight in effect on `date`: the last weigh-in on or before it, else the
 * earliest one known (a day before the first weigh-in still needs a BMR, and
 * the first reading is the best estimate of it). `weighIns` sorted ascending.
 */
export function weightOn(weighIns: WeighIn[], date: string): number | null {
    if (!weighIns.length) return null;
    let found: number | null = null;
    for (const w of weighIns) {
        if (w.date <= date) found = w.weight_g;
        else break;
    }
    return found ?? weighIns[0]!.weight_g;
}

function daysBetween(a: string, b: string): number {
    return Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
            86_400_000,
    );
}

function addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export interface WeightSlope {
    /** Least-squares slope, grams per day (negative = losing). */
    g_per_day: number;
    /** Standard error of that slope, grams per day (0 with two days). */
    se_g_per_day: number;
    /** Distinct weigh-in days used. */
    days: number;
    first_date: string;
    last_date: string;
    span_days: number;
}

/**
 * The weight trend through every weigh-in, by least squares. Same-day
 * readings are averaged first, so a morning with three weigh-ins counts once.
 * The slope uses all of them, so one water-heavy morning at either end moves
 * it far less than (last − first) / span does. Null with fewer than two days.
 */
export function weightSlope(weighIns: WeighIn[]): WeightSlope | null {
    const byDay = new Map<string, number[]>();
    for (const w of weighIns) {
        const list = byDay.get(w.date) ?? [];
        list.push(w.weight_g);
        byDay.set(w.date, list);
    }
    const dates = [...byDay.keys()].sort();
    if (dates.length < 2) return null;
    const first = dates[0]!,
        last = dates.at(-1)!;
    const xs = dates.map((d) => daysBetween(first, d));
    const ys = dates.map((d) => {
        const v = byDay.get(d)!;
        return v.reduce((a, b) => a + b, 0) / v.length;
    });
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0,
        sxx = 0;
    for (let i = 0; i < n; i++) {
        sxy += (xs[i]! - mx) * (ys[i]! - my);
        sxx += (xs[i]! - mx) ** 2;
    }
    const slope = sxy / sxx;
    let sse = 0;
    for (let i = 0; i < n; i++) {
        const fit = my + slope * (xs[i]! - mx);
        sse += (ys[i]! - fit) ** 2;
    }
    const se = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : 0;
    return {
        g_per_day: slope,
        se_g_per_day: se,
        days: n,
        first_date: first,
        last_date: last,
        span_days: daysBetween(first, last),
    };
}

export interface WeightTrend {
    /** Last − first weigh-in in the window, grams. */
    change_g: number;
    /** Least-squares slope, grams per week (negative = losing). */
    weekly_rate_g: number;
    span_days: number;
}

/**
 * Change and rate over the window. A least-squares slope rather than
 * (last − first) / span so one water-heavy morning at either end does not
 * swing the rate. Null with fewer than two weigh-ins on different days.
 */
export function weightTrend(weighIns: WeighIn[]): WeightTrend | null {
    if (weighIns.length < 2) return null;
    const first = weighIns[0]!,
        last = weighIns[weighIns.length - 1]!;
    const span = daysBetween(first.date, last.date);
    if (span <= 0) return null;
    const xs = weighIns.map((w) => daysBetween(first.date, w.date));
    const ys = weighIns.map((w) => w.weight_g);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0,
        den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i]! - mx) * (ys[i]! - my);
        den += (xs[i]! - mx) ** 2;
    }
    const perDay = den === 0 ? 0 : num / den;
    return {
        change_g: last.weight_g - first.weight_g,
        weekly_rate_g: Math.round(perDay * 7),
        span_days: span,
    };
}

/**
 * The date the current rate reaches the target, or null when there is no
 * rate, it points away from the target, or it would take more than two years
 * (a projection that far out is not a forecast of anything).
 */
export function projectTargetDate(
    latest: WeighIn,
    targetG: number,
    weeklyRateG: number,
): string | null {
    const remaining = targetG - latest.weight_g;
    if (remaining === 0) return latest.date;
    if (weeklyRateG === 0 || Math.sign(remaining) !== Math.sign(weeklyRateG))
        return null;
    const days = Math.ceil((remaining / weeklyRateG) * 7);
    if (days > 730) return null;
    return addDays(latest.date, days);
}

// ---------- input validation (tool + dashboard form) ----------

export type BodyPatch = Partial<BodyDetails>;

const isRealDate = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Validates a partial body update. `undefined` leaves a field alone, `null`
 * clears it. Height arrives in cm or inches; it is stored in cm. Bounds live
 * here, not in Zod, so a bad value comes back as a readable message.
 */
export function checkBodyPatch(
    input: {
        height?: unknown;
        height_unit?: unknown;
        birth_date?: unknown;
        sex?: unknown;
    },
    today: string,
): { ok: true; patch: BodyPatch } | { ok: false; error: string } {
    const patch: BodyPatch = {};

    if (input.height === null) patch.height_cm = null;
    else if (input.height !== undefined && input.height !== "") {
        const n =
            typeof input.height === "string"
                ? Number(input.height.trim())
                : input.height;
        if (typeof n !== "number" || !Number.isFinite(n))
            return { ok: false, error: "height must be a number." };
        const unit = input.height_unit ?? "cm";
        if (unit !== "cm" && unit !== "in")
            return { ok: false, error: 'height_unit must be "cm" or "in".' };
        const cm = round1(unit === "in" ? n * 2.54 : n);
        if (cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM)
            return {
                ok: false,
                error: `height ${cm} cm is outside ${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm — check the unit.`,
            };
        patch.height_cm = cm;
    }

    if (input.birth_date === null) patch.birth_date = null;
    else if (input.birth_date !== undefined && input.birth_date !== "") {
        const s = String(input.birth_date).trim();
        if (!isRealDate(s))
            return { ok: false, error: "birth_date must be YYYY-MM-DD." };
        if (s > today)
            return { ok: false, error: "birth_date is in the future." };
        const age = ageOn(s, today);
        if (age < 13 || age > 120)
            return {
                ok: false,
                error: `birth_date gives an age of ${age}; the estimates here are for adults (13–120).`,
            };
        patch.birth_date = s;
    }

    if (input.sex === null) patch.sex = null;
    else if (input.sex !== undefined && input.sex !== "") {
        if (input.sex !== "male" && input.sex !== "female")
            return { ok: false, error: 'sex must be "male" or "female".' };
        patch.sex = input.sex;
    }

    return { ok: true, patch };
}
