// The energy-balance calibration: what the food log and the weight trend say
// the body actually burns, next to what the formula says. One function
// (energyWindow, over the 42 days ending yesterday) backs the Body tab's calibrated baseline, the Trends
// "Estimate vs reality" card and the metabolism chart, so they cannot disagree.
//
//   T (observed TDEE)  = mean intake − weight slope (g/day) × KCAL_PER_GRAM
//   baseline           = T − mean active kcal − mean digestion (foodTef)
//   offset             = mean formula BMR − baseline   (positive = formula high)
//
// Active kcal is SUBTRACTED, never divided out as an activity factor: the
// burn is rebuilt every day as baseline + that day's active + TEF, and only
// the additive split gives T back. The baseline is therefore not a pure BMR:
// it also absorbs everyday movement the watch misses, the watch's own error,
// and any logging error — which is why it is called "baseline burn".
//
// Always computed from FORMULA-burn rows, never from already-calibrated ones,
// so the calibration never feeds on itself.

import { KCAL_PER_GRAM, weightSlope, type WeighIn } from "./body.js";

/** The model's tunable inputs. Defaults are the dashboard's; the what-if
 *  lab passes others, and they never reach goals, balances or the tools. */
export interface ModelParams {
    /** Days of history the calibration looks back over. */
    windowDays: number;
    /** kcal per gram of scale-weight change. */
    kcalPerGram: number;
    /** Digestion as a fixed share of intake, or null to use each day's
     *  macros (foodTef). */
    tefFraction: number | null;
}

export interface EnergyDay {
    date: string;
    /** Logged kcal that day. */
    calories: number;
    active_kcal: number | null;
    /** Formula (Mifflin-St Jeor) BMR for that day, or null. */
    bmr_kcal: number | null;
    /** Thermic effect of that day's food, kcal (foodTef). */
    tef_kcal: number;
    /** Whether the day counts: complete, logged, synced and not excluded. */
    counted: boolean;
}

export type EnergyStatus =
    | "ok"
    | "no_weighins"
    | "too_few_weighins"
    | "no_estimate"
    | "too_few_days"
    | "too_noisy"
    | "missing_bmr";

export interface EnergyWindow {
    status: EnergyStatus;
    from: string;
    to: string;
    first_date: string | null;
    last_date: string | null;
    span_days: number | null;
    /** Distinct days with a weigh-in inside the window. */
    weighin_days: number;
    /** Counted days in [first_date, last_date). */
    counted_days: number;
    /** Weight change along the least-squares trend over the span, grams. */
    trend_change_g: number | null;
    /** The trend's slope and its standard error, grams per day. */
    slope_g_per_day: number | null;
    se_g_per_day: number | null;
    /** The weigh-in days the trend goes through, with the fitted value. */
    weighins: { date: string; weight_g: number; fit_g: number }[];
    mean_intake_kcal: number | null;
    mean_active_kcal: number | null;
    tef_kcal: number | null;
    /** Observed total daily energy expenditure. */
    tdee_kcal: number | null;
    mean_bmr_kcal: number | null;
    /** T − active − TEF, before the ±25% clamp. */
    baseline_kcal: number | null;
    /** Formula BMR − baseline. Positive: the formula runs high. */
    offset_kcal: number | null;
    /** ± kcal/day from the scatter of the weigh-ins around the trend. */
    uncertainty_kcal: number | null;
    /** Formula-predicted change over the counted days, grams. */
    est_logged_g: number | null;
    /** est_logged_g × span ÷ counted, when some days are not counted. */
    est_scaled_g: number | null;
    /** trend_change − estimate. */
    gap_g: number | null;
}

/** Six weeks: long enough that water swings average out (the trend's
 *  uncertainty falls roughly with span^1.5), short enough to follow a real
 *  change in metabolism within weeks. */
export const WINDOW_DAYS = 42;
/** The longest lookback the what-if lab offers (and the fetch covers). */
export const MAX_WINDOW_DAYS = 56;
export const MIN_WINDOW_DAYS = 21;
export const DEFAULT_PARAMS: ModelParams = {
    windowDays: WINDOW_DAYS,
    kcalPerGram: KCAL_PER_GRAM,
    tefFraction: null,
};
export const MIN_SPAN = 21;
/** Weigh-in days needed: about two a week. With only 4 points the slope's
 *  uncertainty rests on 2 degrees of freedom and means little. */
export const MIN_WEIGHIN_DAYS = 8;
export const MIN_COVERAGE = 0.7;
export const MAX_UNCERTAINTY_KCAL = 150;
export const CLAMP = 0.25;

export function shiftDate(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The calibration over weigh-ins and days in [from, to]. Figures are filled
 *  in whenever they can be computed; `status` says whether they are trusted. */
export function energyWindow(
    days: EnergyDay[],
    weighIns: WeighIn[],
    from: string,
    to: string,
    params: ModelParams = DEFAULT_PARAMS,
): EnergyWindow {
    const k = params.kcalPerGram;
    const tefOf = (d: EnergyDay) =>
        params.tefFraction == null
            ? d.tef_kcal
            : params.tefFraction * d.calories;
    const inside = weighIns.filter((w) => w.date >= from && w.date <= to);
    const slope = weightSlope(inside);
    const out: EnergyWindow = {
        status: "no_weighins",
        from,
        to,
        first_date: slope?.first_date ?? null,
        last_date: slope?.last_date ?? null,
        span_days: slope?.span_days ?? null,
        weighin_days: slope?.days ?? new Set(inside.map((w) => w.date)).size,
        counted_days: 0,
        trend_change_g: null,
        slope_g_per_day: null,
        se_g_per_day: null,
        weighins: slope?.points ?? [],
        mean_intake_kcal: null,
        mean_active_kcal: null,
        tef_kcal: null,
        tdee_kcal: null,
        mean_bmr_kcal: null,
        baseline_kcal: null,
        offset_kcal: null,
        uncertainty_kcal: null,
        est_logged_g: null,
        est_scaled_g: null,
        gap_g: null,
    };
    if (!slope) return out;
    const span = slope.span_days;
    // Days first ≤ d < last: a morning weigh-in precedes that day's eating.
    const counted = days.filter(
        (d) =>
            d.counted && d.date >= slope.first_date && d.date < slope.last_date,
    );
    out.counted_days = counted.length;
    out.trend_change_g = Math.round(slope.g_per_day * span);
    out.slope_g_per_day = Math.round(slope.g_per_day * 10) / 10;
    out.se_g_per_day = Math.round(slope.se_g_per_day * 10) / 10;
    out.uncertainty_kcal = Math.round(slope.se_g_per_day * k);
    if (!counted.length) return { ...out, status: "no_estimate" };

    const intake = mean(counted.map((d) => d.calories));
    const active = mean(counted.map((d) => d.active_kcal ?? 0));
    const tef = mean(counted.map(tefOf));
    const tdee = intake - slope.g_per_day * k;
    const baseline = tdee - active - tef;
    Object.assign(out, {
        mean_intake_kcal: Math.round(intake),
        mean_active_kcal: Math.round(active),
        tef_kcal: Math.round(tef),
        tdee_kcal: Math.round(tdee),
        baseline_kcal: Math.round(baseline),
    });

    const withBmr = counted.filter((d) => d.bmr_kcal != null);
    if (withBmr.length === counted.length) {
        const bmr = mean(withBmr.map((d) => d.bmr_kcal!));
        // Predicted change on the formula burn, for the Estimate-vs-reality card.
        const logged =
            withBmr.reduce(
                (s, d) =>
                    s +
                    (d.calories -
                        tefOf(d) -
                        d.bmr_kcal! -
                        (d.active_kcal ?? 0)),
                0,
            ) / k;
        const scaled =
            counted.length < span ? (logged * span) / counted.length : null;
        Object.assign(out, {
            mean_bmr_kcal: Math.round(bmr),
            offset_kcal: Math.round(bmr - baseline),
            est_logged_g: Math.round(logged),
            est_scaled_g: scaled == null ? null : Math.round(scaled),
            gap_g: Math.round(slope.g_per_day * span - (scaled ?? logged)),
        });
    }

    let status: EnergyStatus = "ok";
    if (slope.days < MIN_WEIGHIN_DAYS) status = "too_few_weighins";
    else if (span < MIN_SPAN || counted.length / span < MIN_COVERAGE)
        status = "too_few_days";
    else if (out.uncertainty_kcal! > MAX_UNCERTAINTY_KCAL) status = "too_noisy";
    else if (out.offset_kcal == null) status = "missing_bmr";
    return { ...out, status };
}

/** A day's calibrated baseline: its formula BMR minus the offset, held to
 *  ±25% of that BMR. `clamped` is true when the limit applied. */
export function calibratedBaseline(
    bmr: number,
    offset: number,
): { kcal: number; clamped: boolean } {
    const raw = bmr - offset;
    const kcal = Math.max(bmr * (1 - CLAMP), Math.min(bmr * (1 + CLAMP), raw));
    return { kcal: Math.round(kcal), clamped: kcal !== raw };
}

export interface Calibration {
    basis: "formula" | "calibrated";
    status: EnergyStatus;
    window_days: number;
    counted_days: number;
    implied_kcal_per_day: number | null;
    /** Latest formula BMR in the window. */
    bmr_kcal: number | null;
    /** Calibrated baseline when status is ok, else the formula BMR. */
    resting_kcal: number | null;
    /** True when the ±25% limit held the baseline back. */
    clamped: boolean;
    applied: boolean;
    window: EnergyWindow;
}

/** The calibration for `today`: the WINDOW_DAYS ending yesterday. */
export function buildCalibration(
    days: EnergyDay[],
    weighIns: WeighIn[],
    today: string,
    basis: "formula" | "calibrated",
    params: ModelParams = DEFAULT_PARAMS,
): Calibration {
    const window = energyWindow(
        days,
        weighIns,
        shiftDate(today, -params.windowDays),
        shiftDate(today, -1),
        params,
    );
    const bmr =
        days.filter((d) => d.date <= today && d.bmr_kcal != null).at(-1)
            ?.bmr_kcal ?? null;
    const ok = window.status === "ok" && bmr != null;
    const cal = ok ? calibratedBaseline(bmr, window.offset_kcal!) : null;
    return {
        basis,
        status:
            window.status === "ok" && bmr == null
                ? "missing_bmr"
                : window.status,
        window_days: params.windowDays,
        counted_days: window.counted_days,
        implied_kcal_per_day: window.offset_kcal,
        bmr_kcal: bmr,
        resting_kcal: cal ? cal.kcal : bmr,
        clamped: cal?.clamped ?? false,
        applied: ok && basis === "calibrated",
        window,
    };
}

export interface MetabolismPoint {
    date: string;
    /** Formula (Mifflin-St Jeor) BMR that day. */
    formula_kcal: number | null;
    /** Calibrated baseline from the WINDOW_DAYS before that day, or null when
     *  that window does not qualify. */
    data_kcal: number | null;
    uncertainty_kcal: number | null;
    clamped: boolean;
}

/** One point per date: the formula BMR next to the calibrated baseline the
 *  WINDOW_DAYS before it imply. The last point is exactly the Body tab figure. */
export function metabolismSeries(
    days: EnergyDay[],
    weighIns: WeighIn[],
    dates: string[],
): MetabolismPoint[] {
    const bmrOn = new Map(days.map((d) => [d.date, d.bmr_kcal]));
    return dates.map((date) => {
        const formula = bmrOn.get(date) ?? null;
        const w = energyWindow(
            days,
            weighIns,
            shiftDate(date, -WINDOW_DAYS),
            shiftDate(date, -1),
        );
        const cal =
            w.status === "ok" && formula != null
                ? calibratedBaseline(formula, w.offset_kcal!)
                : null;
        return {
            date,
            formula_kcal: formula,
            data_kcal: cal?.kcal ?? null,
            uncertainty_kcal: cal ? w.uncertainty_kcal : null,
            clamped: cal?.clamped ?? false,
        };
    });
}
