import { test, expect, describe } from "bun:test";
import { buildDashboardDays, buildWeightStats } from "./dashboard-stats.js";
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
        // BMR 1768 (80 kg, 178 cm, 30 y, male) → 1768·1.2 + 300 = 2422.
        expect(days[0]!.burn_kcal).toBe(2422);
        // 2000 eaten − 2422 burned = −422 kcal → −55 g.
        expect(days[0]!.balance_g).toBe(-55);
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
        expect(s.burn_today_kcal).toBe(2322);
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
