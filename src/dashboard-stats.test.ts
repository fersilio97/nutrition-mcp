import { test, expect, describe } from "bun:test";
import {
    buildDashboardDays,
    buildEstimateVsScale,
    buildLast7,
    buildWeightStats,
} from "./dashboard-stats.js";
import { buildDailyBuckets } from "./insights.js";
import type { Meal, NutritionGoals } from "./supabase.js";

const goals = (over: Partial<NutritionGoals> = {}): NutritionGoals => ({
    user_id: "u1",
    daily_calories: 1800,
    daily_protein_g: 120,
    daily_carbs_g: 185,
    daily_fat_g: 65,
    daily_fiber_g: 30,
    daily_sugar_g: 50,
    daily_alcohol_g: null,
    daily_caffeine_mg: null,
    daily_water_ml: 3000,
    target_weight_g: 75_000,
    updated_at: "2026-11-01T00:00:00Z",
    ...over,
});

const meal = (logged_at: string, calories: number): Meal =>
    ({
        id: logged_at,
        user_id: "u1",
        description: "x",
        meal_type: "lunch",
        calories,
        protein_g: 10,
        carbs_g: 10,
        fat_g: 10,
        fiber_g: 1,
        sugar_g: 1,
        alcohol_g: null,
        caffeine_mg: null,
        notes: null,
        logged_at,
        created_at: logged_at,
        idempotency_key: null,
    }) as Meal;

const body = {
    height_cm: 178,
    birth_date: "1996-01-01",
    sex: "male" as const,
};

describe("buildDashboardDays", () => {
    const buckets = buildDailyBuckets(
        [meal("2026-11-08T12:00:00Z", 2000)],
        [],
        "2026-11-08",
        "2026-11-09",
        "UTC",
    );

    test("today's goal includes its active kcal (1800 + 5 = 1805)", () => {
        const days = buildDashboardDays(
            buckets,
            new Map([["2026-11-09", 5]]),
            goals(),
            body,
            [{ date: "2026-11-01", weight_g: 80_000 }],
            "2026-11-09",
        );
        const today = days[1]!;
        expect(today.goal_calories).toBe(1805);
        expect(today.active_kcal).toBe(5);
        expect(today.in_progress).toBe(true);
        expect(days[0]!.goal_calories).toBe(1800);
        expect(days[0]!.active_kcal).toBeNull();
    });

    test("burn and balance: BMR × 1.2 + active, ÷ 7.7 kcal/g", () => {
        const days = buildDashboardDays(
            buckets,
            new Map([["2026-11-08", 300]]),
            goals(),
            body,
            [{ date: "2026-11-01", weight_g: 80_000 }],
            "2026-11-09",
        );
        // BMR 1768 (80 kg, 178 cm, 30 y, male) → 1768 resting + 300 = 2068.
        expect(days[0]!.bmr_kcal).toBe(1768);
        expect(days[0]!.burn_kcal).toBe(2068);
        // 2000 eaten − 2068 burned = −68 kcal → −9 g.
        expect(days[0]!.balance_g).toBe(-9);
    });

    test("no meals → balance unknown, not a full day's deficit", () => {
        const days = buildDashboardDays(
            buckets,
            new Map(),
            goals(),
            body,
            [{ date: "2026-11-01", weight_g: 80_000 }],
            "2026-11-09",
        );
        expect(days[1]!.mealCount).toBe(0);
        expect(days[1]!.burn_kcal).not.toBeNull();
        expect(days[1]!.balance_g).toBeNull();
    });

    test("missing body details → no burn, no balance, goals still shown", () => {
        const days = buildDashboardDays(
            buckets,
            new Map(),
            goals(),
            { height_cm: null, birth_date: null, sex: null },
            [{ date: "2026-11-01", weight_g: 80_000 }],
            "2026-11-09",
        );
        expect(days[0]!.burn_kcal).toBeNull();
        expect(days[0]!.balance_g).toBeNull();
        expect(days[0]!.goal_calories).toBe(1800);
    });
});

describe("buildWeightStats", () => {
    const weighIns = [
        { date: "2026-10-01", weight_g: 82_000 },
        { date: "2026-10-15", weight_g: 81_000 },
        { date: "2026-10-29", weight_g: 80_000 },
    ];

    test("BMI, healthy range, rate, target and projection", () => {
        const s = buildWeightStats(
            weighIns,
            weighIns[2]!,
            body,
            goals(),
            200,
            "2026-11-09",
        );
        expect(s.bmi).toBe(25.2);
        expect(s.bmi_category).toBe("overweight");
        expect(s.healthy_min_g).toBe(58_615);
        expect(s.healthy_max_g).toBe(78_893);
        expect(s.change_g).toBe(-2_000);
        expect(s.weekly_rate_g).toBe(-500);
        expect(s.to_target_g).toBe(-5_000);
        // 5 kg at 500 g/week = 70 days after Oct 29.
        expect(s.projected_date).toBe("2027-01-07");
        expect(s.bmr_kcal).toBe(1768);
        // Resting 1768 + 200 active.
        expect(s.burn_today_kcal).toBe(1968);
        expect(s.missing).toEqual([]);
    });

    test("names exactly what is missing", () => {
        const s = buildWeightStats(
            [],
            null,
            { height_cm: null, birth_date: "1996-01-01", sex: null },
            goals(),
            null,
            "2026-11-09",
        );
        expect(s.missing).toEqual(["height", "sex", "weight"]);
        expect(s.bmi).toBeNull();
        expect(s.bmr_kcal).toBeNull();
        expect(s.projected_date).toBeNull();
    });
});

describe("buildEstimateVsScale", () => {
    // Day rows from `start`, one per balance (null = an unlogged day). The
    // last row is today, still in progress.
    const rows = (start: string, balances: (number | null)[]) =>
        balances.map((balance_g, i) => {
            const d = new Date(`${start}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + i);
            return {
                date: d.toISOString().slice(0, 10),
                balance_g,
                in_progress: i === balances.length - 1,
            };
        });

    test("fully covered span: lost less than estimated → burn runs high", () => {
        // Weigh-ins Oct 20 and Nov 9 → a 20-day span; days Oct 20 … Nov 8
        // (20 of them) all logged at −40 g.
        const r = rows("2026-10-20", [...Array(20).fill(-40), -300]);
        const s = buildEstimateVsScale(
            r,
            [
                { date: "2026-10-20", weight_g: 84_000 },
                { date: "2026-11-09", weight_g: 83_600 },
            ],
            "2026-10-20",
            "2026-11-09",
        );
        expect(s.status).toBe("ok");
        expect(s.span_days).toBe(20);
        expect(s.covered_days).toBe(20);
        expect(s.actual_g).toBe(-400);
        expect(s.est_logged_g).toBe(-800);
        // Fully covered: no scaled figure at all.
        expect(s.est_scaled_g).toBeNull();
        expect(s.gap_g).toBe(400);
        // 400 g × 7.7 ÷ 20 days = 154 kcal/day; positive = estimate HIGH.
        expect(s.implied_kcal_per_day).toBe(154);
        expect(s.calibrated).toBe(true);
    });

    test("the mirror case: lost more than estimated → negative (burn low)", () => {
        const r = rows("2026-10-20", [...Array(20).fill(-40), null]);
        const s = buildEstimateVsScale(
            r,
            [
                { date: "2026-10-20", weight_g: 84_000 },
                { date: "2026-11-09", weight_g: 82_800 },
            ],
            "2026-10-20",
            "2026-11-09",
        );
        expect(s.gap_g).toBe(-400);
        expect(s.implied_kcal_per_day).toBe(-154);
    });

    test("gappy span: scaled figure beside the logged one; gap uses scaled", () => {
        // 20-day span, 10 logged days at −50 g → logged −500, scaled −1000.
        const balances: (number | null)[] = [];
        for (let i = 0; i < 20; i++) balances.push(i % 2 ? null : -50);
        balances.push(null);
        const s = buildEstimateVsScale(
            rows("2026-10-20", balances),
            [
                { date: "2026-10-20", weight_g: 84_000 },
                { date: "2026-11-09", weight_g: 83_200 },
            ],
            "2026-10-20",
            "2026-11-09",
        );
        expect(s.status).toBe("ok");
        expect(s.covered_days).toBe(10);
        expect(s.est_logged_g).toBe(-500);
        expect(s.est_scaled_g).toBe(-1000);
        expect(s.gap_g).toBe(200);
        // 50% logged: the offset is computed but must not be stated.
        expect(s.calibrated).toBe(false);
    });

    test("a short span is never calibrated, even fully logged", () => {
        const s = buildEstimateVsScale(
            rows("2026-11-01", [-10, -10, -10, -10, -10, -10, -10, -10, null]),
            [
                { date: "2026-11-01", weight_g: 84_000 },
                { date: "2026-11-08", weight_g: 83_900 },
            ],
            "2026-11-01",
            "2026-11-09",
        );
        expect(s.span_days).toBe(7);
        expect(s.covered_days).toBe(7);
        expect(s.calibrated).toBe(false);
    });

    test("the last weigh-in's own day and today's partial day are excluded", () => {
        // Weigh-ins Nov 1 and Nov 9 (today). Nov 9's −999 must not count:
        // it is both the last day and in progress.
        const r = rows(
            "2026-11-01",
            [-10, -10, -10, -10, -10, -10, -10, -10, -999],
        );
        const s = buildEstimateVsScale(
            r,
            [
                { date: "2026-11-01", weight_g: 84_000 },
                { date: "2026-11-09", weight_g: 83_900 },
            ],
            "2026-11-01",
            "2026-11-09",
        );
        expect(s.est_logged_g).toBe(-80);
        expect(s.covered_days).toBe(8);
    });

    test("< 2 weigh-ins (or two on one date) → no_weighins, every field null", () => {
        const r = rows("2026-11-01", [-10, -10, null]);
        for (const w of [
            [],
            [{ date: "2026-11-02", weight_g: 80_000 }],
            [
                { date: "2026-11-02", weight_g: 80_000 },
                { date: "2026-11-02", weight_g: 79_800 },
            ],
            // A weigh-in outside the period does not count.
            [
                { date: "2026-10-01", weight_g: 80_000 },
                { date: "2026-11-02", weight_g: 79_800 },
            ],
        ]) {
            const s = buildEstimateVsScale(r, w, "2026-11-01", "2026-11-03");
            expect(s).toEqual({
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
            });
        }
    });

    test("no balance in the span (no body details) → no_estimate, scale only", () => {
        const s = buildEstimateVsScale(
            rows("2026-11-01", [null, null, null, null]),
            [
                { date: "2026-11-01", weight_g: 80_000 },
                { date: "2026-11-03", weight_g: 79_500 },
            ],
            "2026-11-01",
            "2026-11-04",
        );
        expect(s.status).toBe("no_estimate");
        expect(s.actual_g).toBe(-500);
        expect(s.covered_days).toBe(0);
        expect(s.est_logged_g).toBeNull();
        expect(s.implied_kcal_per_day).toBeNull();
        // Same key set as every other state.
        expect(Object.keys(s).sort()).toEqual(
            Object.keys(buildEstimateVsScale([], [], "a", "b")).sort(),
        );
    });
});

describe("buildLast7", () => {
    // Nov 1 … Nov 9 (today, in progress). `balances` per day; burn present
    // unless noBurn.
    const days = (balances: (number | null)[], noBurn = false) =>
        balances.map((balance_g, i) => ({
            date: `2026-11-0${i + 1}`,
            balance_g,
            burn_kcal: noBurn ? null : 2000,
            in_progress: i === balances.length - 1,
        }));

    test("scale change in grams and the net estimate over the 7 complete days", () => {
        // Window Nov 2 … Nov 9; complete days Nov 2 … Nov 8.
        const r = buildLast7(
            days([-999, -10, -20, null, -30, -40, -50, -60, -500]),
            [
                { date: "2026-10-30", weight_g: 85_000 }, // before the window
                { date: "2026-11-02", weight_g: 84_000 },
                { date: "2026-11-09", weight_g: 83_650 },
            ],
            "2026-11-09",
        );
        expect(r.from).toBe("2026-11-02");
        expect(r.to).toBe("2026-11-09");
        expect(r.weight_change_g).toBe(-350);
        expect(r.weight_first_date).toBe("2026-11-02");
        // Nov 1 is outside, Nov 5 unlogged, today in progress → 6 days.
        expect(r.est_days).toBe(6);
        expect(r.est_net_g).toBe(-210);
        expect(r.has_burn).toBe(true);
    });

    test("one weigh-in (or two on one day) → no scale figure", () => {
        for (const w of [
            [{ date: "2026-11-05", weight_g: 84_000 }],
            [
                { date: "2026-11-05", weight_g: 84_000 },
                { date: "2026-11-05", weight_g: 83_800 },
            ],
        ]) {
            const r = buildLast7(
                days([0, 0, 0, 0, 0, 0, 0, 0, 0]),
                w,
                "2026-11-09",
            );
            expect(r.weight_change_g).toBeNull();
            expect(r.weight_first_date).toBeNull();
        }
    });

    test("no body details → no estimate, and has_burn says why", () => {
        const r = buildLast7(
            days([null, null, null, null, null, null, null, null, null], true),
            [],
            "2026-11-09",
        );
        expect(r.est_net_g).toBeNull();
        expect(r.est_days).toBe(0);
        expect(r.has_burn).toBe(false);
    });
});
