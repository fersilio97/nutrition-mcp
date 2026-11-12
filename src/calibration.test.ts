import { describe, expect, test } from "bun:test";
import { buildCalibration, type CalibrationDay } from "./calibration.js";
import { buildDashboardPayload, dashboardWindow } from "./dashboard.js";
import { buildScenario, previewInputs } from "./dashboard-fixture.js";

const TODAY = "2026-12-01";
const BMR = 2_000;
const date = (n: number) =>
    new Date(Date.parse("2026-10-01T00:00:00Z") + n * 86_400_000)
        .toISOString()
        .slice(0, 10);

function sample(span: number, counted = span, deltaG = 0) {
    const days: CalibrationDay[] = Array.from({ length: span }, (_, i) => ({
        date: date(i),
        bmr_kcal: BMR,
        balance_g: i < counted ? 0 : null,
        in_progress: false,
    }));
    const weighIns = [
        { date: date(0), weight_g: 80_000 },
        { date: date(span), weight_g: 80_000 + deltaG },
    ];
    return buildCalibration(days, weighIns, date(25), "calibrated");
}

describe("buildCalibration", () => {
    test("clamps resting burn at both 25% bounds", () => {
        expect(sample(20, 20, 10_000).resting_kcal).toBe(1_500);
        expect(sample(20, 20, -10_000).resting_kcal).toBe(2_500);
    });

    test("positive implied offset lowers resting burn", () => {
        const c = sample(20, 20, 500);
        expect(c.implied_kcal_per_day).toBeGreaterThan(0);
        expect(c.resting_kcal).toBeLessThan(BMR);
    });

    test("derives offset from formula-burn balances only", () => {
        const days = Array.from({ length: 20 }, (_, i) => ({
            date: date(i),
            bmr_kcal: BMR,
            balance_g: 10,
            in_progress: false,
        }));
        const c = buildCalibration(
            days,
            [
                { date: date(0), weight_g: 80_000 },
                { date: date(20), weight_g: 80_000 + 200 },
            ],
            date(25),
            "calibrated",
        );
        expect(c.implied_kcal_per_day).toBe(
            Math.round(((200 - 200) * 7.7) / 20),
        );
    });

    test("excludes skipped days and scales remaining balance across the span", () => {
        const days = Array.from({ length: 20 }, (_, i) => ({
            date: date(i),
            bmr_kcal: BMR,
            balance_g: 10,
            in_progress: false,
            skipped: i === 0,
        }));
        const c = buildCalibration(
            days,
            [
                { date: date(0), weight_g: 80_000 },
                { date: date(20), weight_g: 80_000 },
            ],
            date(25),
            "calibrated",
            [date(0)],
        );
        expect(c.counted_days).toBe(19);
        expect(c.skipped_days).toEqual([date(0)]);
        expect(c.implied_kcal_per_day).toBe(-77);
    });

    test("requires a 14-day span and 70% coverage", () => {
        expect(sample(13).status).toBe("too_few_days");
        expect(sample(14).status).toBe("ok");
        expect(sample(20, 13).status).toBe("too_few_days");
        expect(sample(20, 14).status).toBe("ok");
    });

    test("falls back to BMR with each non-ok status", () => {
        const noWeighins = buildCalibration([], [], TODAY, "calibrated");
        const noEstimate = buildCalibration(
            [
                {
                    date: date(1),
                    bmr_kcal: BMR,
                    balance_g: null,
                    in_progress: false,
                },
            ],
            [
                { date: date(0), weight_g: 80_000 },
                { date: date(20), weight_g: 80_000 },
            ],
            date(25),
            "calibrated",
        );
        const missingBmr = buildCalibration(
            Array.from({ length: 20 }, (_, i) => ({
                date: date(i),
                bmr_kcal: null,
                balance_g: 0,
                in_progress: false,
            })),
            [
                { date: date(0), weight_g: 80_000 },
                { date: date(20), weight_g: 80_000 },
            ],
            date(25),
            "calibrated",
        );
        for (const c of [noWeighins, noEstimate, sample(13), missingBmr]) {
            expect(c.applied).toBe(false);
            expect(c.resting_kcal).toBe(c.bmr_kcal);
        }
        expect([
            noWeighins.status,
            noEstimate.status,
            sample(13).status,
            missingBmr.status,
        ]).toEqual([
            "no_weighins",
            "no_estimate",
            "too_few_days",
            "missing_bmr",
        ]);
    });

    test("automatically excludes no-meal and in-progress days", () => {
        const days: CalibrationDay[] = Array.from(
            { length: 20 },
            (_, i): CalibrationDay => ({
                date: date(i),
                bmr_kcal: BMR,
                balance_g: 10,
                in_progress: i === 19,
            }),
        );
        days[0]!.balance_g = null; // no meal
        const c = buildCalibration(
            days,
            [
                { date: date(0), weight_g: 80_000 },
                { date: date(20), weight_g: 80_000 },
            ],
            date(25),
            "calibrated",
        );
        expect(c.counted_days).toBe(18);
    });

    test("a skipped dashboard day reduces counted days and changes applied resting burn", () => {
        const today = TODAY;
        const fx = buildScenario("calibrate", today);
        const inputs = previewInputs(fx, 90, today);
        const initial = buildDashboardPayload(inputs);
        const skipDate = initial.daily
            .filter(
                (r) =>
                    r.counts_in_calibration &&
                    r.date < initial.weights.at(-1)!.date,
            )
            .at(-1)!.date;
        const skipped = buildDashboardPayload({
            ...inputs,
            skippedDays: [skipDate],
        });
        expect(skipped.calibration.counted_days).toBe(
            initial.calibration.counted_days - 1,
        );
        expect(skipped.calibration.applied).toBe(true);
        expect(
            skipped.daily.find((r) => r.date === skipDate)!.bmr_kcal,
        ).not.toBe(initial.daily.find((r) => r.date === skipDate)!.bmr_kcal);
    });
});

describe("dashboardWindow", () => {
    test("fetches the 28-day calibration window whatever the chart range", () => {
        const w = dashboardWindow("2026-11-11", 7);
        expect(w.startDate).toBe("2026-11-05");
        expect(w.fetchStart).toBe("2026-10-14");
    });
});
