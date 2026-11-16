import { describe, expect, test } from "bun:test";
import { TEF_FRACTION, breakEvenKcal, type WeighIn } from "./body.js";
import {
    buildDashboardPayload,
    checkGoalPlan,
    checkModelSettings,
} from "./dashboard.js";
import { buildScenario, previewInputs } from "./dashboard-fixture.js";
import type { NutritionGoals } from "./supabase.js";
import type { EnergyDay } from "./calibration.js";
import {
    MIN_ACTIVE_DAYS,
    activeAverage,
    goalActiveKcal,
    goalFlags,
    goalKcal,
    gramsPerDayToRate,
    planRate,
    rateToGramsPerDay,
    recommendedRates,
    resolveGoalMode,
    tefRatio,
    trendWeightToday,
    type FlagInput,
    type RatePlan,
    type TrendWeight,
} from "./goal-plan.js";

const iso = (n: number) =>
    new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);

/** A straight line of daily weigh-ins ending on day `last`. */
function line(last: number, count: number, startG: number, gPerDay: number) {
    const out: WeighIn[] = [];
    for (let i = 0; i < count; i++) {
        const d = last - count + 1 + i;
        out.push({ date: iso(d), weight_g: startG + gPerDay * i });
    }
    return out;
}

describe("goalKcal", () => {
    test("rate 0 at the default share is breakEvenKcal", () => {
        expect(goalKcal(1700, 300, 0)).toBe(breakEvenKcal(1700, 300));
        expect(goalKcal(1700, null, 0, 6, TEF_FRACTION)).toBe(
            breakEvenKcal(1700, null),
        );
    });

    test("-0.5 kg/week at f = 0.1: balance deficit 429, intake drops 476", () => {
        // -500 g / 7 d × 6 kcal/g = -428.6 kcal/day of balance; the gross-up
        // ÷0.9 turns it into -476 kcal of intake (eating less also digests less).
        const rate = rateToGramsPerDay(-0.5, "kg", "week");
        const even = goalKcal(1700, 300, 0);
        const plan = goalKcal(1700, 300, rate);
        expect(even - plan).toBe(476);
    });

    test("a gain goal raises the intake", () => {
        expect(goalKcal(1700, 0, 50)).toBeGreaterThan(goalKcal(1700, 0, 0));
    });

    test("k scales the delta", () => {
        const r = -70;
        expect(goalKcal(1700, 0, r, 7.7)).toBeLessThan(goalKcal(1700, 0, r, 6));
    });
});

describe("rate conversions", () => {
    test("week / month / year to g/day", () => {
        expect(rateToGramsPerDay(-0.7, "kg", "week")).toBeCloseTo(-100, 6);
        expect(rateToGramsPerDay(-1, "kg", "month")).toBeCloseTo(
            -1000 / 30.4375,
            6,
        );
        expect(rateToGramsPerDay(-12, "kg", "year")).toBeCloseTo(
            -12000 / 365.25,
            6,
        );
    });

    test("lb converts through 453.59237 g", () => {
        expect(rateToGramsPerDay(-1, "lb", "week")).toBeCloseTo(
            -453.59237 / 7,
            6,
        );
    });

    test("round trip to the display unit", () => {
        const g = rateToGramsPerDay(-1.5, "lb", "month");
        expect(gramsPerDayToRate(g, "lb", "month")).toBeCloseTo(-1.5, 9);
    });
});

describe("resolveGoalMode", () => {
    test("legacy rows follow their calorie number", () => {
        expect(resolveGoalMode(null)).toBe("burn");
        expect(resolveGoalMode({ daily_calories: null })).toBe("burn");
        expect(resolveGoalMode({ daily_calories: 0 })).toBe("burn");
        expect(resolveGoalMode({ daily_calories: 2000 })).toBe("fixed");
    });

    test("a stored mode wins", () => {
        expect(
            resolveGoalMode({
                calorie_goal_mode: "rate",
                daily_calories: 2000,
            }),
        ).toBe("rate");
    });
});

describe("tefRatio", () => {
    const day = (cal: number, tef: number, counted = true): EnergyDay => ({
        date: iso(0),
        calories: cal,
        active_kcal: null,
        bmr_kcal: 1700,
        tef_kcal: tef,
        counted,
    });

    test("too few counted days falls back to the default share", () => {
        expect(tefRatio([day(2000, 300)])).toBe(TEF_FRACTION);
    });

    test("uses the user's own intake-weighted share", () => {
        const days = Array.from({ length: 10 }, () => day(2000, 300));
        expect(tefRatio(days)).toBeCloseTo(0.15, 9);
    });

    test("uncounted days are ignored and the share is bounded", () => {
        const days = [
            ...Array.from({ length: 7 }, () => day(2000, 2000)),
            day(2000, 0, false),
        ];
        expect(tefRatio(days)).toBe(0.2);
    });
});

describe("trendWeightToday", () => {
    test("extrapolates a clean line to today", () => {
        // 80 kg falling 50 g/day; the last weigh-in is today.
        const w = line(30, 30, 80_000, -50);
        const t = trendWeightToday(w, iso(30), 42)!;
        expect(t.source).toBe("trend");
        expect(t.weight_g).toBe(80_000 - 50 * 29);
    });

    test("a water-heavy latest reading barely moves the trend", () => {
        const w = line(30, 30, 80_000, -50);
        w[w.length - 1] = {
            ...w[w.length - 1]!,
            weight_g: 80_000 - 50 * 29 + 1500,
        };
        const t = trendWeightToday(w, iso(30), 42)!;
        expect(Math.abs(t.weight_g - (80_000 - 50 * 29))).toBeLessThan(400);
    });

    test("extrapolation stops after a week without a weigh-in", () => {
        const w = line(20, 20, 80_000, -50);
        const t = trendWeightToday(w, iso(40), 42)!;
        expect(t.weight_g).toBe(80_000 - 50 * 19 - 50 * 7);
    });

    test("few weigh-ins fall back to the recent mean, then the latest", () => {
        const two = [
            { date: iso(28), weight_g: 80_000 },
            { date: iso(30), weight_g: 81_000 },
        ];
        expect(trendWeightToday(two, iso(30), 42)).toMatchObject({
            source: "recent_mean",
            weight_g: 80_500,
        });
        expect(
            trendWeightToday(
                [{ date: iso(10), weight_g: 79_000 }],
                iso(30),
                42,
            ),
        ).toMatchObject({ source: "latest", weight_g: 79_000 });
        expect(trendWeightToday([], iso(30), 42)).toBeNull();
    });

    // A real first week: one heavy first morning, then flat around 81.2–81.7.
    // A line through it ends at 80.98, below every reading; with one week of
    // span the line is not used and the last seven days are averaged instead.
    const firstWeek = [
        82_700, 81_700, 81_400, 81_200, 81_500, 81_300, 81_200, 81_200,
    ];

    test("one week of weigh-ins is averaged, not fitted", () => {
        const w = firstWeek.map((g, i) => ({ date: iso(i), weight_g: g }));
        const t = trendWeightToday(w, iso(7), 42)!;
        expect(t.source).toBe("recent_mean");
        // Nov 10–16 only: the heavy first morning is eight days back.
        expect(t.weight_g).toBe(81_357);
        expect(t.weighin_days).toBe(7);
    });

    test("a line tilted by an early spike is held within the last week", () => {
        // Same shape over a fortnight: 84 kg on day 0, then 81.2–81.5.
        const w = [{ date: iso(0), weight_g: 84_000 }];
        for (let i = 1; i <= 14; i++)
            w.push({ date: iso(i), weight_g: i % 2 ? 81_500 : 81_200 });
        const t = trendWeightToday(w, iso(14), 42)!;
        expect(t.source).toBe("trend");
        expect(t.clamped).toBe(true);
        expect(t.weight_g).toBe(81_200);
    });

    test("a steady loss is not clamped and still extrapolates", () => {
        const w = line(20, 20, 80_000, -50);
        const t = trendWeightToday(w, iso(23), 42)!;
        expect(t.clamped).toBe(false);
        expect(t.weight_g).toBe(80_000 - 50 * 19 - 50 * 3);
    });

    test("same-day readings count once in the recent average", () => {
        const w = [
            { date: iso(5), weight_g: 80_000 },
            { date: iso(6), weight_g: 82_000 },
            { date: iso(6), weight_g: 82_000 },
            { date: iso(6), weight_g: 82_000 },
        ];
        expect(trendWeightToday(w, iso(6), 42)!.weight_g).toBe(81_000);
    });

    test("the lookback window is a parameter", () => {
        // 60 days: flat for 40, then falling. A 21-day window sees only the fall.
        const flat = line(39, 40, 90_000, 0);
        const fall = line(59, 20, 90_000, -100);
        const w = [...flat, ...fall];
        const short = trendWeightToday(w, iso(59), 21)!;
        const long = trendWeightToday(w, iso(59), 56)!;
        expect(short.weight_g).toBeLessThan(long.weight_g);
    });
});

describe("planRate", () => {
    const trend = (g: number): TrendWeight => ({
        weight_g: g,
        source: "trend",
        window_days: 42,
        weighin_days: 20,
        clamped: false,
    });
    const date = (target: number, on: string) => ({
        mode: "date" as const,
        rate_g_per_day: null,
        target_weight_g: target,
        target_date: on,
    });

    test("fixed and burn carry no rate", () => {
        for (const mode of ["fixed", "burn"] as const) {
            expect(
                planRate(
                    {
                        mode,
                        rate_g_per_day: -50,
                        target_weight_g: null,
                        target_date: null,
                    },
                    trend(80_000),
                    iso(0),
                ).rate_g_per_day,
            ).toBe(0);
        }
    });

    test("a rate goal keeps its stored rate", () => {
        expect(
            planRate(
                {
                    mode: "rate",
                    rate_g_per_day: -71.4,
                    target_weight_g: null,
                    target_date: null,
                },
                null,
                iso(0),
            ).rate_g_per_day,
        ).toBe(-71.4);
    });

    test("a date goal spreads the remaining distance over the days left", () => {
        // 80 kg -> 76 kg in 40 days: -100 g/day.
        const p = planRate(date(76_000, iso(40)), trend(80_000), iso(0));
        expect(p.rate_g_per_day).toBeCloseTo(-100, 9);
        expect(p.days_left).toBe(40);
        expect(p.reached).toBe(false);
    });

    test("the rate re-derives as the trend moves", () => {
        const a = planRate(date(76_000, iso(40)), trend(80_000), iso(0));
        const b = planRate(date(76_000, iso(40)), trend(79_000), iso(10));
        expect(a.rate_g_per_day).toBeCloseTo(-100, 9);
        expect(b.rate_g_per_day).toBeCloseTo(-3000 / 30, 9);
    });

    test("reached, or past the date, falls back to break-even", () => {
        expect(
            planRate(date(80_000, iso(40)), trend(80_300), iso(0)),
        ).toMatchObject({ rate_g_per_day: 0, reached: true });
        expect(
            planRate(date(76_000, iso(0)), trend(80_000), iso(5)),
        ).toMatchObject({ rate_g_per_day: 0, reached: true });
    });

    test("a gain target gives a positive rate", () => {
        expect(
            planRate(date(84_000, iso(40)), trend(80_000), iso(0))
                .rate_g_per_day,
        ).toBeCloseTo(100, 9);
    });

    test("no trend yet: no rate rather than a guess", () => {
        expect(
            planRate(date(76_000, iso(40)), null, iso(0)).rate_g_per_day,
        ).toBe(0);
    });
});

describe("goalFlags", () => {
    const plan = (over: Partial<RatePlan> = {}): RatePlan => ({
        mode: "rate",
        rate_g_per_day: -70,
        target_weight_g: null,
        target_date: null,
        days_left: null,
        reached: false,
        ...over,
    });
    const input = (over: Partial<FlagInput> = {}): FlagInput => ({
        plan: plan(),
        trend: {
            weight_g: 80_000,
            source: "trend",
            window_days: 42,
            weighin_days: 20,
            clamped: false,
        },
        restingKcal: 1700,
        bmrKcal: 1700,
        activeKcal: 300,
        goalKcal: 1756, // (1700 + 300 - 420) / 0.9
        kcalPerGram: 6,
        tefShare: 0.1,
        sex: "male",
        age: 35,
        heightCm: 180,
        calibrated: true,
        today: iso(0),
        ...over,
    });
    const codes = (i: FlagInput) => goalFlags(i).map((f) => f.code);

    test("a moderate plan raises nothing", () => {
        expect(goalFlags(input())).toEqual([]);
    });

    test("fixed and burn modes are never flagged", () => {
        expect(
            goalFlags(
                input({ plan: plan({ mode: "fixed", rate_g_per_day: -400 }) }),
            ),
        ).toEqual([]);
    });

    test("fast loss: over 1% of weight per week", () => {
        // 80 kg: 800 g/week is the line; -120 g/day = 840 g/week.
        expect(
            codes(input({ plan: plan({ rate_g_per_day: -120 }) })),
        ).toContain("fast_loss");
        expect(
            codes(input({ plan: plan({ rate_g_per_day: -110 }) })),
        ).not.toContain("fast_loss");
    });

    test("fast gain: over 0.5% of weight per week", () => {
        expect(codes(input({ plan: plan({ rate_g_per_day: 70 }) }))).toContain(
            "fast_gain",
        );
        expect(
            codes(input({ plan: plan({ rate_g_per_day: 50 }) })),
        ).not.toContain("fast_gain");
    });

    test("big deficit: over 25% of total burn including digestion, or 1000 kcal", () => {
        // Total burn = (1700 + 300) ÷ 0.9 = 2222, so the 25% line is 555.6
        // kcal of balance deficit (not 500 of resting + active alone).
        // -90 g/d × 6 = 540: fine; -95 -> 570: flagged.
        expect(
            codes(input({ plan: plan({ rate_g_per_day: -90 }) })),
        ).not.toContain("big_deficit");
        expect(codes(input({ plan: plan({ rate_g_per_day: -95 }) }))).toContain(
            "big_deficit",
        );
        expect(codes(input())).not.toContain("big_deficit");
        // The 1,000 kcal cap is the same balance deficit, with no gross-up.
        expect(
            codes(
                input({
                    plan: plan({ rate_g_per_day: -170 }),
                    restingKcal: 3000,
                    activeKcal: 1500,
                }),
            ),
        ).toContain("big_deficit");
    });

    test("low intake: below max(BMR, 1200/1500)", () => {
        expect(codes(input())).not.toContain("low_intake");
        expect(codes(input({ goalKcal: 1650 }))).toContain("low_intake");
        expect(
            codes(
                input({
                    goalKcal: 1300,
                    sex: "female",
                    restingKcal: 1100,
                    bmrKcal: 1100,
                }),
            ),
        ).not.toContain("low_intake");
    });

    test("the floor follows the anchor it is given, not the deficit's resting figure", () => {
        // The anchor (bmrKcal) is the resting figure chosen in Body details;
        // restingKcal only measures the deficit.
        expect(
            codes(input({ restingKcal: 1500, bmrKcal: 1700, goalKcal: 1650 })),
        ).toContain("low_intake");
        expect(
            codes(input({ restingKcal: 2000, bmrKcal: 1700, goalKcal: 1750 })),
        ).not.toContain("low_intake");
        // With no anchor the usual minimum still applies.
        expect(codes(input({ bmrKcal: null, goalKcal: 1400 }))).toContain(
            "low_intake",
        );
    });

    test("underweight target and minors", () => {
        // 180 cm: BMI 18.5 at 59.9 kg.
        expect(
            codes(input({ plan: plan({ target_weight_g: 58_000 }) })),
        ).toContain("underweight_target");
        expect(codes(input({ age: 16 }))).toContain("minor_loss");
    });

    test("date windows", () => {
        const d = (days_left: number) =>
            input({ plan: plan({ mode: "date", days_left }) });
        expect(codes(d(10))).toContain("date_soon");
        expect(codes(d(0))).toContain("date_passed");
        expect(codes(d(800))).toContain("date_far");
        expect(codes(d(60))).not.toContain("date_soon");
    });

    test("uncertainty is info, not red", () => {
        const flags = goalFlags(input({ calibrated: false, trend: null }));
        expect(flags.map((f) => f.code)).toEqual(["formula_basis", "no_trend"]);
        expect(flags.every((f) => f.level === "info")).toBe(true);
    });
});

describe("derived goals in the dashboard payload", () => {
    const TODAY = "2026-12-01";
    const fx = buildScenario("offset", TODAY);
    const goalsOf = (goals: Partial<NutritionGoals>): NutritionGoals => ({
        user_id: "",
        daily_calories: null,
        daily_protein_g: null,
        daily_carbs_g: null,
        daily_fat_g: null,
        daily_fiber_g: null,
        daily_sugar_g: null,
        daily_alcohol_g: null,
        daily_caffeine_mg: null,
        daily_water_ml: null,
        target_weight_g: null,
        calorie_goal_mode: null,
        weight_rate_g_per_day: null,
        target_date: null,
        updated_at: "",
        ...goals,
    });
    const payloadFor = (goals: Partial<NutritionGoals> | null) =>
        buildDashboardPayload(
            previewInputs(
                { ...fx, goals: goals ? goalsOf(goals) : null },
                30,
                TODAY,
            ),
        );

    test("today's goal starts from the lookback average, each past day from its own", () => {
        const p = payloadFor({
            calorie_goal_mode: "rate",
            weight_rate_g_per_day: -70,
        });
        const avg = activeAverage(
            p.calibrationDetail.days,
            TODAY,
            p.calibrationDetail.constants.window_days,
        );
        expect(avg).not.toBeNull();
        expect(p.goalPlan.active_avg_kcal).toBe(Math.round(avg!));
        const past = p.daily.filter(
            (r) => r.date < TODAY && r.active_avg_kcal != null,
        );
        expect(past.length).toBeGreaterThan(5);
        // Each window slides with its day, so the averages differ.
        expect(
            new Set(past.map((r) => Math.round(r.active_avg_kcal!))).size,
        ).toBeGreaterThan(1);
        for (const r of p.daily.filter((r) => r.bmr_kcal != null))
            expect(r.goal_calories).toBe(
                goalKcal(
                    r.bmr_kcal!,
                    r.goal_active_kcal!,
                    p.goalPlan.rate_g_per_day,
                    p.goalPlan.kcal_per_gram,
                    p.goalPlan.tef_share,
                ),
            );
    });

    test("a ride above the average raises today's goal by all of the excess", () => {
        const goals = {
            calorie_goal_mode: "rate" as const,
            weight_rate_g_per_day: -70,
        };
        const before = payloadFor(goals);
        const avg = before.goalPlan.active_avg_kcal!;
        const ride = avg + 800;
        const withRide = buildDashboardPayload(
            previewInputs(
                {
                    ...fx,
                    activity: [
                        ...fx.activity.filter((a) => a.date !== TODAY),
                        {
                            user_id: "",
                            date: TODAY,
                            active_kcal: ride,
                            source: "test",
                            updated_at: "",
                        },
                    ],
                    goals: goalsOf(goals),
                },
                30,
                TODAY,
            ),
        );
        expect(withRide.goalPlan.goal_active_kcal).toBe(ride);
        const t = withRide.daily.at(-1)!;
        expect(t.goal_calories).toBe(
            goalKcal(
                t.bmr_kcal!,
                ride,
                withRide.goalPlan.rate_g_per_day,
                withRide.goalPlan.kcal_per_gram,
                withRide.goalPlan.tef_share,
            ),
        );
        // All 800 kcal above the usual reach the goal, grossed up for the
        // digestion of eating them.
        const atUsual = goalKcal(
            t.bmr_kcal!,
            avg,
            withRide.goalPlan.rate_g_per_day,
            withRide.goalPlan.kcal_per_gram,
            withRide.goalPlan.tef_share,
        );
        expect(
            Math.abs(
                t.goal_calories! -
                    atUsual -
                    800 / (1 - withRide.goalPlan.tef_share),
            ),
        ).toBeLessThanOrEqual(1);
    });

    test("a rate goal lowers every day's goal by the grossed-up deficit", () => {
        const burn = payloadFor(null);
        const rate = payloadFor({
            calorie_goal_mode: "rate",
            weight_rate_g_per_day: rateToGramsPerDay(-0.5, "kg", "week"),
        });
        const f = rate.goalPlan.tef_share;
        const want = Math.round(((500 / 7) * 6) / (1 - f));
        for (const r of rate.daily.filter((r) => r.bmr_kcal != null)) {
            const b = burn.daily.find((d) => d.date === r.date)!;
            expect(
                Math.abs(b.goal_calories! - r.goal_calories! - want),
            ).toBeLessThanOrEqual(1);
        }
        expect(rate.goalPlan.mode).toBe("rate");
        expect(rate.goalPlan.goal_kcal).toBe(
            rate.daily.find((d) => d.date === TODAY)!.goal_calories,
        );
    });

    test("a date goal derives today's rate from the trend weight", () => {
        const probe = payloadFor({ calorie_goal_mode: "date" });
        const trend = probe.goalPlan.trend!;
        const p = payloadFor({
            calorie_goal_mode: "date",
            target_weight_g: trend.weight_g - 4000,
            target_date: "2027-01-10", // 40 days out
        });
        expect(p.goalPlan.days_left).toBe(40);
        expect(p.goalPlan.rate_g_per_day).toBeCloseTo(-100, 6);
        expect(p.goalPlan.trend!.source).toBe("trend");
    });

    test("a fixed goal is its figure plus the goal active and raises no plan flags", () => {
        const p = payloadFor({ daily_calories: 2100 });
        expect(p.goalPlan.mode).toBe("fixed");
        expect(p.goalPlan.flags).toEqual([]);
        expect(
            p.daily.every(
                (r) => r.goal_calories === 2100 + (r.goal_active_kcal ?? 0),
            ),
        ).toBe(true);
    });

    test("an aggressive rate is flagged but still applied", () => {
        const p = payloadFor({
            calorie_goal_mode: "rate",
            weight_rate_g_per_day: -200,
        });
        expect(p.goalPlan.flags.map((f) => f.code)).toContain("fast_loss");
        expect(p.goalPlan.goal_kcal).not.toBeNull();
    });

    test("the intake floor follows the resting basis chosen in Body details", () => {
        for (const scenario of ["calibrate", "offset"] as const) {
            const f = buildScenario(scenario, TODAY);
            const p = buildDashboardPayload(
                previewInputs({ ...f, goals: null }, 30, TODAY),
            );
            const min = p.body.sex === "male" ? 1500 : 1200;
            // resting_kcal is the calibrated baseline when calibration is
            // applied, else the formula BMR: the floor anchors on it.
            const anchor = p.goalPlan.resting_kcal!;
            expect(p.goalPlan.limits.intake_floor_kcal).toBe(
                Math.round(Math.max(anchor, min)),
            );
            expect(p.goalPlan.resting_basis).toBe(
                p.calibration.applied ? "calibrated" : "formula",
            );
        }
    });

    test("protein holds while carbs and fat follow the day's calories", () => {
        const p = payloadFor({
            calorie_goal_mode: "rate",
            weight_rate_g_per_day: -70,
            daily_protein_g: 150,
            daily_carbs_g: 200,
            daily_fat_g: 60,
        });
        const row = p.daily.find((r) => (r.active_kcal ?? 0) > 0)!;
        expect(row.goal_protein_g).toBe(150);
        const factor = row.goal_calories! / row.goal_base_calories!;
        expect(row.goal_carbs_g).toBeCloseTo(200 * factor, 0);
        expect(row.goal_fat_g).toBeCloseTo(60 * factor, 0);
    });

    test("the user's kcal/g reaches the goal and the balance together", () => {
        const withK = (k: number | null) =>
            buildDashboardPayload(
                previewInputs(
                    {
                        ...fx,
                        profile: { ...fx.profile, energy_kcal_per_gram: k },
                        goals: {
                            user_id: "",
                            daily_calories: null,
                            daily_protein_g: null,
                            daily_carbs_g: null,
                            daily_fat_g: null,
                            daily_fiber_g: null,
                            daily_sugar_g: null,
                            daily_alcohol_g: null,
                            daily_caffeine_mg: null,
                            daily_water_ml: null,
                            target_weight_g: null,
                            calorie_goal_mode: "rate",
                            weight_rate_g_per_day: -70,
                            target_date: null,
                            updated_at: "",
                        },
                    },
                    30,
                    TODAY,
                ),
            );
        const six = withK(null);
        const high = withK(7.7);
        expect(six.goalPlan.kcal_per_gram).toBe(6);
        expect(high.goalPlan.kcal_per_gram).toBe(7.7);
        // A bigger kcal/g makes the same rate a bigger deficit.
        expect(high.goalPlan.goal_kcal!).toBeLessThan(six.goalPlan.goal_kcal!);
        const row = high.daily.find((r) => r.balance_kcal != null)!;
        expect(row.balance_g).toBe(Math.round(row.balance_kcal! / 7.7));
    });

    test("the trend lookback is the user's own", () => {
        const withWindow = (w: number | null) =>
            buildDashboardPayload(
                previewInputs(
                    {
                        ...fx,
                        profile: { ...fx.profile, trend_window_days: w },
                        goals: null,
                    },
                    30,
                    TODAY,
                ),
            );
        expect(withWindow(null).goalPlan.trend!.window_days).toBe(42);
        expect(withWindow(28).goalPlan.trend!.window_days).toBe(28);
    });
});

describe("recommendedRates", () => {
    const base = {
        trendG: 80_000,
        restingKcal: 1700,
        bmrKcal: 1700,
        activeKcal: 300,
        kcalPerGram: 6,
        tefShare: 0.1,
        sex: "male" as const,
        age: 35,
    };

    test("1% of body weight per week binds for a typical adult", () => {
        // 80 kg: 1% = 800 g/week = 114 g/day. Burn 2000: the 25% cap is 500
        // kcal, but the intake floor max(1700, 1500) = 1700 leaves only
        // 2000 − 1700×0.9 = 470 kcal, so the floor binds.
        const r = recommendedRates(base);
        expect(r.max_loss_g_per_day).toBeCloseTo(470 / 6, 6);
        expect(r.loss_binding).toBe("intake_floor");
        // Every limit is listed, so the page can show them all.
        expect(r.loss_limits.weekly_pct).toBeCloseTo((80_000 * 0.01) / 7, 6);
        expect(r.loss_limits.weekly_kg).toBeCloseTo(1000 / 7, 6);
        // 25% of total burn incl. digestion: 0.25 × 2000 ÷ 0.9 = 555.6 kcal.
        expect(r.loss_limits.deficit_share).toBeCloseTo(500 / 0.9 / 6, 6);
        expect(r.loss_limits.deficit_kcal).toBeCloseTo(1000 / 6, 6);
        expect(r.active_ref_kcal).toBe(300);
        expect(r.max_gain_g_per_day).toBeCloseTo((80_000 * 0.005) / 7, 6);
    });

    test("a heavy, high-burn user is held by 1%/week or 1 kg/week", () => {
        const r = recommendedRates({
            ...base,
            trendG: 150_000,
            restingKcal: 3000,
            bmrKcal: 3000,
            activeKcal: 1500,
        });
        // Burn 4500: 25% of 4500 ÷ 0.9 = 1250 → the 1000 kcal cap = 166.7
        // g/day; the floor leaves 1800; 1% of 150 kg = 214 g/day; 1 kg/week =
        // 142.9 g/day.
        expect(r.max_loss_g_per_day).toBeCloseTo(1000 / 7, 6);
        expect(r.loss_binding).toBe("weekly_kg");
    });

    test("the intake floor binds when burn is close to it", () => {
        // burn 1700+100 = 1800; floor max(1700, 1500) = 1700; room to cut:
        // 1800 − 1700×0.9 = 270 kcal.
        const r = recommendedRates({ ...base, activeKcal: 100 });
        expect(r.max_loss_g_per_day).toBeCloseTo(270 / 6, 6);
    });

    test("no loss is advised under 18, and none without body details", () => {
        expect(recommendedRates({ ...base, age: 16 }).max_loss_g_per_day).toBe(
            0,
        );
        expect(recommendedRates({ ...base, age: 16 }).loss_binding).toBe(
            "minor",
        );
        expect(
            recommendedRates({ ...base, restingKcal: null }).max_loss_g_per_day,
        ).toBeNull();
        expect(
            recommendedRates({ ...base, trendG: null }).max_gain_g_per_day,
        ).toBeNull();
    });

    test("a calibrated baseline below the BMR: deficits use it, the floor uses the BMR", () => {
        // Calibrated resting 1594, formula BMR 1726, active 346, f 0.112.
        const r = recommendedRates({
            trendG: 78_900,
            restingKcal: 1594,
            bmrKcal: 1726,
            activeKcal: 346,
            kcalPerGram: 6,
            tefShare: 0.112,
            sex: "male",
            age: 35,
        });
        // 25% of total burn: 0.25 × 1940 ÷ 0.888 = 546.2 kcal = 91.0 g/day.
        expect(r.loss_limits.deficit_share).toBeCloseTo(546.2 / 6, 1);
        // Floor: max(1726, 1500) = 1726 leaves 1940 − 1726×0.888 = 407.3 kcal.
        expect(r.loss_limits.intake_floor).toBeCloseTo(407.3 / 6, 1);
        expect(r.loss_binding).toBe("intake_floor");
        expect(r.max_loss_g_per_day).toBeCloseTo(67.9, 1);
        // The row shows the exact floor, and says the BMR set it.
        expect(r.intake_floor_kcal).toBe(1726);
        expect(r.intake_floor_source).toBe("resting");
        // A low BMR falls back to the usual minimum.
        const low = recommendedRates({ ...base, bmrKcal: 1300 });
        expect(low.intake_floor_kcal).toBe(1500);
        expect(low.intake_floor_source).toBe("minimum");
    });

    test("the maximum rate is exactly what the flags accept", () => {
        const r = recommendedRates(base);
        const rate = -(r.max_loss_g_per_day ?? 0);
        const f = goalFlags({
            plan: {
                mode: "rate",
                rate_g_per_day: rate,
                target_weight_g: null,
                target_date: null,
                days_left: null,
                reached: false,
            },
            trend: {
                weight_g: 80_000,
                source: "trend",
                window_days: 42,
                weighin_days: 20,
                clamped: false,
            },
            restingKcal: 1700,
            bmrKcal: 1700,
            activeKcal: 300,
            goalKcal: goalKcal(1700, 300, rate, 6, 0.1),
            kcalPerGram: 6,
            tefShare: 0.1,
            sex: "male",
            age: 35,
            heightCm: 180,
            calibrated: true,
            today: iso(0),
        }).filter((x) => x.level === "red");
        expect(f).toEqual([]);
    });
});

describe("checkGoalPlan", () => {
    const ctx = { today: "2026-11-15", unit: "kg" as const };

    test("the old { calories } shape still means fixed or the estimated burn", () => {
        expect(checkGoalPlan({ calories: 1800 }, ctx)).toEqual({
            ok: true,
            value: {
                mode: "fixed",
                daily_calories: 1800,
                weight_rate_g_per_day: null,
                target_date: null,
            },
        });
        expect(checkGoalPlan({ calories: null }, ctx)).toMatchObject({
            ok: true,
            value: { mode: "burn", daily_calories: null },
        });
    });

    test("a rate, in the user's unit and period", () => {
        const r = checkGoalPlan(
            { mode: "rate", rate: -1, unit: "lb", period: "month" },
            ctx,
        );
        expect(r).toMatchObject({ ok: true, value: { mode: "rate" } });
        if (r.ok)
            expect(r.value.weight_rate_g_per_day).toBeCloseTo(
                -453.59237 / 30.4375,
                2,
            );
        // Defaults to the profile unit and a week.
        const d = checkGoalPlan({ mode: "rate", rate: -0.7 }, ctx);
        if (d.ok) expect(d.value.weight_rate_g_per_day).toBeCloseTo(-100, 2);
    });

    test("a date goal needs a plausible weight and a future date", () => {
        const ok = checkGoalPlan(
            { mode: "date", target_weight: 75, target_date: "2026-12-25" },
            ctx,
        );
        expect(ok).toMatchObject({
            ok: true,
            value: { target_weight_g: 75_000, target_date: "2026-12-25" },
        });
        for (const bad of [
            { target_weight: 75, target_date: "2026-11-15" },
            { target_weight: 75, target_date: "2026-02-30" },
            { target_weight: 75, target_date: "soon" },
            { target_weight: 5, target_date: "2026-12-25" },
            { target_date: "2026-12-25" },
        ])
            expect(checkGoalPlan({ mode: "date", ...bad }, ctx).ok).toBe(false);
    });

    test("only impossible input is refused; an aggressive rate is accepted", () => {
        expect(checkGoalPlan({ mode: "rate", rate: -1.5 }, ctx).ok).toBe(true);
        expect(checkGoalPlan({ mode: "rate" }, ctx).ok).toBe(false);
        expect(checkGoalPlan({ mode: "rate", rate: "x" }, ctx).ok).toBe(false);
        expect(
            checkGoalPlan({ mode: "rate", rate: -1, period: "decade" }, ctx).ok,
        ).toBe(false);
        // A unit slip (-500 kg per week) is the one thing a rate bound catches.
        expect(checkGoalPlan({ mode: "rate", rate: -500 }, ctx).ok).toBe(false);
        expect(checkGoalPlan({ mode: "fixed" }, ctx).ok).toBe(false);
        expect(checkGoalPlan({ mode: "nope" }, ctx).ok).toBe(false);
    });
});

describe("checkModelSettings", () => {
    test("accepts the documented ranges and clears with null", () => {
        expect(
            checkModelSettings({
                energy_kcal_per_gram: 7.7,
                trend_window_days: 28,
            }),
        ).toEqual({
            ok: true,
            patch: { energy_kcal_per_gram: 7.7, trend_window_days: 28 },
        });
        expect(
            checkModelSettings({
                energy_kcal_per_gram: null,
                trend_window_days: "",
            }),
        ).toEqual({
            ok: true,
            patch: { energy_kcal_per_gram: null, trend_window_days: null },
        });
        expect(checkModelSettings({})).toEqual({ ok: true, patch: {} });
    });

    test("rejects out-of-range and non-whole values", () => {
        for (const bad of [
            { energy_kcal_per_gram: 2 },
            { energy_kcal_per_gram: 12 },
            { energy_kcal_per_gram: "abc" },
            { trend_window_days: 10 },
            { trend_window_days: 90 },
            { trend_window_days: 30.5 },
        ])
            expect(checkModelSettings(bad).ok).toBe(false);
    });
});

describe("goal active kcal: the usual from the morning, rising with the watch", () => {
    const days = (n: number, kcal: number | null, counted = true) =>
        Array.from({ length: n }, (_, i) => ({
            date: `2026-11-${String(i + 1).padStart(2, "0")}`,
            counted,
            active_kcal: kcal,
        }));

    test("the average covers counted, synced days before the date only", () => {
        const e = [
            ...days(10, 300),
            { date: "2026-11-11", counted: true, active_kcal: null },
            { date: "2026-11-12", counted: false, active_kcal: 2000 },
            { date: "2026-11-13", counted: true, active_kcal: 5000 },
        ];
        // 11-13 is the day itself: a part-finished today never drags it.
        expect(activeAverage(e, "2026-11-13", 42)).toBe(300);
    });

    test("too few days: no average, so the day's own figure is used", () => {
        const e = days(MIN_ACTIVE_DAYS - 1, 300);
        expect(activeAverage(e, "2026-11-30", 42)).toBeNull();
        expect(goalActiveKcal(null, 120)).toBe(120);
        expect(goalActiveKcal(null, null)).toBe(0);
    });

    test("the lookback is the trend window", () => {
        const e = days(10, 300);
        expect(activeAverage(e, "2026-11-30", 42)).toBe(300);
        // 2026-11-30 − 15 days = 11-15: none of the 10 days are inside.
        expect(activeAverage(e, "2026-11-30", 15)).toBeNull();
    });

    test("morning: nothing synced yet, the goal stands on the average", () => {
        expect(goalActiveKcal(250, 0)).toBe(250);
        expect(goalActiveKcal(250, null)).toBe(250);
    });

    test("once the day has active, a below-average day lowers it", () => {
        expect(goalActiveKcal(250, 104)).toBe(104);
    });

    test("a ride above the average raises it by all of the ride", () => {
        expect(goalActiveKcal(250, 1050)).toBe(1050);
    });
});
