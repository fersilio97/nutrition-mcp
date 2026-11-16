import { describe, expect, test } from "bun:test";
import {
    buildAdvisorReport,
    COMPONENT_WEIGHTS,
    formatAdvisorText,
    MIN_LOGGED_DAYS,
    type AdvisorOptions,
} from "./advisor.js";
import { buildDailyBuckets } from "./insights.js";
import type { Meal, NutritionGoals } from "./supabase.js";

function meal(logged_at: string, fields: Partial<Meal> = {}): Meal {
    return {
        id: `m-${logged_at}-${Math.random()}`,
        user_id: "u1",
        logged_at,
        meal_type: "lunch",
        description: "test meal",
        calories: 500,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 20,
        fiber_g: null,
        sugar_g: null,
        alcohol_g: null,
        caffeine_mg: null,
        sodium_mg: null,
        source: null,
        notes: null,
        idempotency_key: null,
        ...fields,
    };
}

function goals(fields: Partial<NutritionGoals> = {}): NutritionGoals {
    return {
        user_id: "u1",
        daily_calories: null,
        daily_protein_g: null,
        daily_carbs_g: null,
        daily_fat_g: null,
        daily_fiber_g: null,
        daily_sugar_g: null,
        daily_alcohol_g: null,
        daily_caffeine_mg: null,
        daily_sodium_mg: null,
        daily_water_ml: null,
        target_weight_g: null,
        calorie_goal_mode: null,
        weight_rate_g_per_day: null,
        target_date: null,
        updated_at: "2026-06-02T00:00:00Z",
        ...fields,
    };
}

const OPTS: AdvisorOptions = {
    tz: "UTC",
    weightKg: null,
    alcoholEnabled: false,
};

// 2026-06-01 is a Monday, so the window below is Mon..Sun.
const DAYS = [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
    "2026-06-06",
    "2026-06-07",
];

/** A week where every day has the same noon + 13:00 meals unless overridden. */
function week(
    perDay: (date: string, i: number) => Meal[],
    tz = "UTC",
    water: { logged_at: string; amount_ml: number }[] = [],
) {
    const meals = DAYS.flatMap((d, i) => perDay(d, i));
    return buildDailyBuckets(
        meals,
        water.map((w, i) => ({
            id: `w${i}`,
            user_id: "u1",
            logged_at: w.logged_at,
            amount_ml: w.amount_ml,
            notes: null,
            created_at: w.logged_at,
            idempotency_key: null,
        })),
        DAYS[0]!,
        DAYS[6]!,
        tz,
    );
}

const ids = (
    r: ReturnType<typeof buildAdvisorReport>,
    kind: "good" | "improve",
) => r.findings.filter((f) => f.kind === kind).map((f) => f.id);

describe("data gate", () => {
    test("fewer than the minimum logged days gives no score", () => {
        const buckets = week((d, i) =>
            i < MIN_LOGGED_DAYS - 1 ? [meal(`${d}T12:00:00Z`)] : [],
        );
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(r.enoughData).toBe(false);
        expect(r.score).toBeNull();
        expect(r.verdict).toBeNull();
        expect(r.findings).toHaveLength(1);
        expect(r.findings[0]!.id).toBe("logging");
        expect(r.components.every((c) => c.score === null)).toBe(true);
    });

    test("exactly the minimum is enough", () => {
        const buckets = week((d, i) =>
            i < MIN_LOGGED_DAYS ? [meal(`${d}T12:00:00Z`)] : [],
        );
        expect(buildAdvisorReport(buckets, goals(), OPTS).enoughData).toBe(
            true,
        );
    });

    test("an empty window does not throw", () => {
        const r = buildAdvisorReport([], null, OPTS);
        expect(r.enoughData).toBe(false);
        expect(r.window).toEqual({ start: "", end: "" });
    });
});

describe("calorie consistency", () => {
    test("good when most days land near the goal", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { calories: 2000 }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_calories: 2000 }),
            OPTS,
        );
        expect(ids(r, "good")).toContain("energy-consistency");
    });

    test("improve when few days land near the goal", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { calories: 1200 }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_calories: 2000 }),
            OPTS,
        );
        expect(ids(r, "improve")).toContain("energy-consistency");
    });

    test("skipped without a calorie goal, and its weight is redistributed", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { calories: 2000, protein_g: 150 }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_protein_g: 100 }),
            OPTS,
        );
        const energy = r.components.find((c) => c.id === "energy")!;
        expect(energy.score).toBeNull();
        expect(energy.points).toBe(0);
        expect(ids(r, "good")).not.toContain("energy-consistency");
        expect(ids(r, "improve")).not.toContain("energy-consistency");
    });
});

describe("protein", () => {
    test("uses the goal when set", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { protein_g: 50 }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_protein_g: 100 }),
            OPTS,
        );
        expect(ids(r, "improve")).toContain("protein");
    });

    test("falls back to g/kg of body weight", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { protein_g: 100 }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), {
            ...OPTS,
            weightKg: 75,
        });
        // target 90 g, ate 100 g
        expect(ids(r, "good")).toContain("protein");
    });

    test("skipped with neither a goal nor a weight", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`)]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(r.components.find((c) => c.id === "protein")!.score).toBeNull();
    });
});

describe("fiber and sugar", () => {
    test("fiber skipped when no day carries it", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`)]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(r.components.find((c) => c.id === "fiber")!.score).toBeNull();
    });

    test("low fiber is flagged", () => {
        // 2000 kcal a day puts the default target at 28 g.
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { calories: 2000, fiber_g: 8 }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(ids(r, "improve")).toContain("fiber");
    });

    test("fiber averages only the days that carry it", () => {
        const buckets = week((d, i) => [
            meal(`${d}T12:00:00Z`, { fiber_g: i < 4 ? 30 : null }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        const f = r.findings.find((x) => x.id === "fiber")!;
        expect(f.kind).toBe("good");
        expect(f.evidence.daysWithData).toBe(4);
        expect(f.evidence.avgG).toBe(30);
    });

    test("sugar over the goal ceiling is flagged", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`, { sugar_g: 90 })]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_sugar_g: 50 }),
            OPTS,
        );
        expect(ids(r, "improve")).toContain("sugar");
    });

    test("sugar under the ceiling is good", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`, { sugar_g: 20 })]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_sugar_g: 50 }),
            OPTS,
        );
        expect(ids(r, "good")).toContain("sugar");
    });
});

describe("alcohol", () => {
    const drinky = (d: string, i: number) => [
        meal(`${d}T20:00:00Z`, { alcohol_g: i < 4 ? 40 : 0 }),
    ];

    test("silent when alcohol tracking is off", () => {
        const r = buildAdvisorReport(week(drinky), goals(), OPTS);
        expect(r.findings.some((f) => f.id === "alcohol")).toBe(false);
    });

    test("flagged on several drinking days when on", () => {
        const r = buildAdvisorReport(week(drinky), goals(), {
            ...OPTS,
            alcoholEnabled: true,
        });
        expect(ids(r, "improve")).toContain("alcohol");
    });

    test("an alcohol-free week is good", () => {
        const r = buildAdvisorReport(
            week((d) => [meal(`${d}T20:00:00Z`, { alcohol_g: 0 })]),
            goals(),
            { ...OPTS, alcoholEnabled: true },
        );
        expect(ids(r, "good")).toContain("alcohol");
    });
});

describe("back-loaded eating", () => {
    test("flags most calories after 18:00", () => {
        const buckets = week((d) => [
            meal(`${d}T09:00:00Z`, { calories: 200, meal_type: "breakfast" }),
            meal(`${d}T20:30:00Z`, { calories: 1400, meal_type: "dinner" }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        const f = r.findings.find((x) => x.id === "back-loaded")!;
        expect(f.kind).toBe("improve");
        expect(f.evidence.lateSharePct).toBe(88);
    });

    test("good when calories are spread out", () => {
        const buckets = week((d) => [
            meal(`${d}T08:00:00Z`, { calories: 600 }),
            meal(`${d}T13:00:00Z`, { calories: 700 }),
            meal(`${d}T19:00:00Z`, { calories: 500 }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(ids(r, "good")).toContain("back-loaded");
    });

    test("late is judged in the user's timezone, not UTC", () => {
        // 20:00 in Kyiv (UTC+3 in June) is 17:00 UTC: late locally, not in UTC.
        const perDay = (d: string) => [
            meal(`${d}T07:00:00Z`, { calories: 300 }),
            meal(`${d}T17:00:00Z`, { calories: 1500 }),
        ];
        const kyiv = buildAdvisorReport(week(perDay, "Europe/Kyiv"), goals(), {
            ...OPTS,
            tz: "Europe/Kyiv",
        });
        const utc = buildAdvisorReport(week(perDay), goals(), OPTS);
        expect(kyiv.findings.find((f) => f.id === "back-loaded")!.kind).toBe(
            "improve",
        );
        expect(utc.findings.find((f) => f.id === "back-loaded")!.kind).not.toBe(
            "improve",
        );
    });

    test("a past-midnight meal counts as late", () => {
        const buckets = week((d) => [
            meal(`${d}T10:00:00Z`, { calories: 300 }),
            meal(`${d}T01:30:00Z`, { calories: 1200 }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(ids(r, "improve")).toContain("back-loaded");
    });
});

describe("overeat day", () => {
    test("names the weekday and calls out a weekend spike", () => {
        // Saturday 2026-06-06 is the big day.
        const buckets = week((d) => [
            meal(`${d}T13:00:00Z`, {
                calories: d === "2026-06-06" ? 3600 : 2000,
            }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        const f = r.findings.find((x) => x.id === "overeat-day")!;
        expect(f.kind).toBe("improve");
        expect(f.title).toBe("Saturday was a big day");
        expect(f.detail).toContain("weekend spike");
        expect(f.evidence.kcal).toBe(3600);
    });

    test("a weekday spike is not labelled a weekend spike", () => {
        const buckets = week((d) => [
            meal(`${d}T13:00:00Z`, {
                calories: d === "2026-06-03" ? 3600 : 2000,
            }),
        ]);
        const f = buildAdvisorReport(buckets, goals(), OPTS).findings.find(
            (x) => x.id === "overeat-day",
        )!;
        expect(f.title).toBe("Wednesday was a big day");
        expect(f.detail).not.toContain("weekend");
    });

    test("a day above the median but not above the goal is not a spike", () => {
        // 2700 > 1.35 x median 2000, but 2700 < 1.25 x goal 2500.
        const buckets = week((d) => [
            meal(`${d}T13:00:00Z`, {
                calories: d === "2026-06-06" ? 2700 : 2000,
            }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_calories: 2500 }),
            OPTS,
        );
        expect(ids(r, "improve")).not.toContain("overeat-day");
    });

    test("a steady week has no spikes", () => {
        const buckets = week((d) => [
            meal(`${d}T13:00:00Z`, { calories: 2000 }),
        ]);
        expect(
            ids(buildAdvisorReport(buckets, goals(), OPTS), "good"),
        ).toContain("overeat-day");
    });
});

describe("breakfast, hydration and logging", () => {
    test("skipped when no meal carries a type", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, { meal_type: null }),
        ]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(r.findings.some((f) => f.id === "breakfast")).toBe(false);
    });

    test("skipped breakfasts are flagged", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`)]);
        expect(
            ids(buildAdvisorReport(buckets, goals(), OPTS), "improve"),
        ).toContain("breakfast");
    });

    test("regular breakfasts are good", () => {
        const buckets = week((d) => [
            meal(`${d}T08:00:00Z`, { meal_type: "breakfast" }),
        ]);
        expect(
            ids(buildAdvisorReport(buckets, goals(), OPTS), "good"),
        ).toContain("breakfast");
    });

    test("hydration needs a water goal", () => {
        const buckets = week((d) => [meal(`${d}T12:00:00Z`)]);
        const r = buildAdvisorReport(buckets, goals(), OPTS);
        expect(
            r.components.find((c) => c.id === "hydration")!.score,
        ).toBeNull();
    });

    test("low water against a goal is flagged", () => {
        const buckets = week(
            (d) => [meal(`${d}T12:00:00Z`)],
            "UTC",
            DAYS.map((d) => ({ logged_at: `${d}T10:00:00Z`, amount_ml: 800 })),
        );
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_water_ml: 2000 }),
            OPTS,
        );
        expect(ids(r, "improve")).toContain("hydration");
    });

    // Vault 004: water is opt-in, so a stored water goal must not score or
    // nag a user who switched water tracking off.
    test("water tracking off: no hydration rule and no hydration score", () => {
        const buckets = week(
            (d) => [meal(`${d}T12:00:00Z`)],
            "UTC",
            DAYS.map((d) => ({ logged_at: `${d}T10:00:00Z`, amount_ml: 800 })),
        );
        const r = buildAdvisorReport(buckets, goals({ daily_water_ml: 2000 }), {
            ...OPTS,
            waterEnabled: false,
        });
        expect(ids(r, "improve")).not.toContain("hydration");
        expect(
            r.components.find((c) => c.id === "hydration")!.score,
        ).toBeNull();
    });

    test("a fully logged week is credited, a patchy one is not", () => {
        const full = buildAdvisorReport(
            week((d) => [meal(`${d}T12:00:00Z`)]),
            goals(),
            OPTS,
        );
        expect(ids(full, "good")).toContain("logging");
        const patchy = buildAdvisorReport(
            week((d, i) => (i < 4 ? [meal(`${d}T12:00:00Z`)] : [])),
            goals(),
            OPTS,
        );
        expect(ids(patchy, "improve")).toContain("logging");
    });
});

describe("score", () => {
    test("component points add up to the score", () => {
        const buckets = week((d) => [
            meal(`${d}T12:00:00Z`, {
                calories: 1900,
                protein_g: 90,
                fiber_g: 20,
                sugar_g: 40,
            }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_calories: 2000, daily_protein_g: 100 }),
            OPTS,
        );
        const sum = r.components.reduce((s, c) => s + c.points, 0);
        expect(r.score).toBe(Math.round(sum));
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(100);
    });

    test("a missing component's weight is spread over the rest", () => {
        // Only protein (hit exactly) and timing have data: both perfect => 100.
        const buckets = week((d) => [
            meal(`${d}T08:00:00Z`, { calories: 600, protein_g: 50 }),
            meal(`${d}T13:00:00Z`, { calories: 700, protein_g: 50 }),
            meal(`${d}T19:00:00Z`, { calories: 500, protein_g: 50 }),
        ]);
        const r = buildAdvisorReport(
            buckets,
            goals({ daily_protein_g: 100 }),
            OPTS,
        );
        const active = r.components.filter((c) => c.score != null);
        expect(active.map((c) => c.id).sort()).toEqual(["protein", "timing"]);
        expect(r.score).toBe(100);
        const p = r.components.find((c) => c.id === "protein")!;
        const t = r.components.find((c) => c.id === "timing")!;
        expect(p.points).toBeCloseTo(
            (100 * COMPONENT_WEIGHTS.protein) /
                (COMPONENT_WEIGHTS.protein + COMPONENT_WEIGHTS.timing),
            1,
        );
        expect(p.points + t.points).toBeCloseTo(100, 1);
    });

    test("a better week scores higher than a worse one", () => {
        const g = goals({ daily_calories: 2000, daily_protein_g: 100 });
        const good = buildAdvisorReport(
            week((d) => [
                meal(`${d}T08:00:00Z`, { calories: 700, protein_g: 35 }),
                meal(`${d}T13:00:00Z`, { calories: 800, protein_g: 40 }),
                meal(`${d}T19:00:00Z`, { calories: 500, protein_g: 25 }),
            ]),
            g,
            OPTS,
        );
        const bad = buildAdvisorReport(
            week((d) => [
                meal(`${d}T21:30:00Z`, { calories: 1200, protein_g: 40 }),
            ]),
            g,
            OPTS,
        );
        expect(good.score!).toBeGreaterThan(bad.score!);
    });

    test("advice slot is reserved and empty", () => {
        const r = buildAdvisorReport(
            week((d) => [meal(`${d}T12:00:00Z`)]),
            goals(),
            OPTS,
        );
        expect(r.advice).toBeNull();
    });
});

describe("formatAdvisorText", () => {
    test("renders score, both lists and the disclaimer", () => {
        const buckets = week((d) => [
            meal(`${d}T21:00:00Z`, { calories: 1500, protein_g: 40 }),
        ]);
        const text = formatAdvisorText(
            buildAdvisorReport(buckets, goals({ daily_protein_g: 100 }), OPTS),
        );
        expect(text).toContain("Eating review — 2026-06-01 to 2026-06-07");
        expect(text).toContain("Score:");
        expect(text).toContain("To improve:");
        expect(text).toContain("not medical or dietary advice");
    });

    test("the not-enough-data case states why", () => {
        const text = formatAdvisorText(
            buildAdvisorReport(
                week((d, i) => (i === 0 ? [meal(`${d}T12:00:00Z`)] : [])),
                goals(),
                OPTS,
            ),
        );
        expect(text).toContain("Only 1 of the last 7 days");
        expect(text).not.toContain("Score:");
    });
});
