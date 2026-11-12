import { KCAL_PER_GRAM, type WeighIn } from "./body.js";

export interface CalibrationDay {
    date: string;
    bmr_kcal: number | null;
    balance_g: number | null;
    in_progress: boolean;
    skipped?: boolean;
}

export interface Calibration {
    basis: "formula" | "calibrated";
    status:
        "ok" | "too_few_days" | "no_weighins" | "no_estimate" | "missing_bmr";
    window_days: number;
    counted_days: number;
    skipped_days: string[];
    implied_kcal_per_day: number | null;
    bmr_kcal: number | null;
    resting_kcal: number | null;
    applied: boolean;
}

const MIN_SPAN = 14;
const MIN_COVERAGE = 0.7;
const diff = (a: string, b: string) =>
    Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
            86400000,
    );

/** Uses balances from the formula-burn pass only, avoiding calibration feedback. */
export function buildCalibration(
    days: CalibrationDay[],
    weighIns: WeighIn[],
    today: string,
    basis: "formula" | "calibrated",
    skipped: string[] = [],
): Calibration {
    const from = shift(today, -28);
    const to = shift(today, -1);
    const window = days.filter((d) => d.date >= from && d.date <= to);
    const inside = weighIns
        .filter((w) => w.date >= from && w.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
    const bmr =
        window.filter((d) => d.bmr_kcal != null).at(-1)?.bmr_kcal ?? null;
    const base: Calibration = {
        basis,
        status: "no_weighins",
        window_days: 28,
        counted_days: 0,
        skipped_days: skipped.filter((d) => d >= from && d <= to).sort(),
        implied_kcal_per_day: null,
        bmr_kcal: bmr,
        resting_kcal: bmr,
        applied: false,
    };
    if (inside.length < 2) return base;
    const first = inside[0]!,
        last = inside.at(-1)!;
    const span = diff(first.date, last.date);
    if (span <= 0) return base;
    let total = 0,
        counted = 0;
    for (const d of window) {
        if (
            d.date < first.date ||
            d.date >= last.date ||
            d.in_progress ||
            d.balance_g == null ||
            d.skipped
        )
            continue;
        total += d.balance_g;
        counted++;
    }
    if (!counted) return { ...base, status: "no_estimate" };
    const scaled = counted < span ? (total * span) / counted : total;
    const offset = Math.round(
        ((last.weight_g - first.weight_g - scaled) * KCAL_PER_GRAM) / span,
    );
    const valid = span >= MIN_SPAN && counted / span >= MIN_COVERAGE;
    if (!valid)
        return {
            ...base,
            status: "too_few_days",
            counted_days: counted,
            implied_kcal_per_day: offset,
        };
    if (bmr == null)
        return {
            ...base,
            status: "missing_bmr",
            counted_days: counted,
            implied_kcal_per_day: offset,
        };
    const resting = Math.max(bmr * 0.75, Math.min(bmr * 1.25, bmr - offset));
    return {
        ...base,
        status: "ok",
        counted_days: counted,
        implied_kcal_per_day: offset,
        resting_kcal: Math.round(resting),
        applied: basis === "calibrated",
    };
}

function shift(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
