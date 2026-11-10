// The dev preview's synthetic data (src/dashboard-fixture.ts). No mock.module
// here: the fixture is pure, and the drift guard that compares it with the
// real dashboardPayload lives in mcp.test.ts's "dashboard API" block, inside
// the shared Supabase mock window (see CLAUDE.md).
import { test, expect, describe } from "bun:test";
import { buildDashboardPayload } from "./dashboard.js";
import {
    SCENARIOS,
    buildScenario,
    previewInputs,
    previewPayload,
    scenarioTz,
} from "./dashboard-fixture.js";
import { dateInTz } from "./tz.js";

const TODAY = "2026-11-09";
const payloadAt = (
    name: (typeof SCENARIOS)[number],
    days: number,
    today = TODAY,
) =>
    buildDashboardPayload(
        previewInputs(buildScenario(name, today), days, today),
    );

// These build whole synthetic scenarios (hundreds of Intl-formatted
// timestamps). Normally ~100 ms each, but a machine under load once stalled
// one past bun's 5 s default and failed it with no assertion message (seen
// with TZ=Pacific/Kiritimati during a full run; 165 ms when rerun alone). The
// scenario cache removes most of the work; this keeps a slow box from
// failing a correct test.
const HEAVY_MS = 30_000;

describe("preview fixture windows", () => {
    for (const name of SCENARIOS)
        for (const days of [1, 7, 30, 90, 365])
            test(
                `${name}, days=${days}: rows stay inside the window`,
                () => {
                    const tz = scenarioTz(name);
                    const d = payloadAt(name, days);
                    expect(d.daily).toHaveLength(days);
                    expect(d.daily.at(-1)!.in_progress).toBe(true);
                    expect(d.daily.at(-1)!.date).toBe(TODAY);
                    expect(
                        d.daily.slice(0, -1).some((r) => r.in_progress),
                    ).toBe(false);
                    for (const m of d.meals) {
                        const day = dateInTz(m.logged_at, tz);
                        expect(day >= d.startDate && day <= d.endDate).toBe(
                            true,
                        );
                    }
                    for (const w of d.weights)
                        expect(
                            w.date >= d.weightWindowStart &&
                                w.date <= d.endDate,
                        ).toBe(true);
                },
                HEAVY_MS,
            );

    test("dashboard ranges return their daily, weekly and monthly buckets", () => {
        for (const [days, granularity, count] of [
            [7, "day", 7],
            [30, "week", 4],
            [365, "month", 12],
        ] as const) {
            const d = payloadAt("full", days);
            expect(d.granularity).toBe(granularity);
            expect(d.trendBuckets).toHaveLength(count);
        }
    });

    test(
        "the real-today path the server uses also holds",
        () => {
            for (const name of SCENARIOS) {
                const d = previewPayload(name, 30);
                expect(d.daily).toHaveLength(30);
                expect(d.daily.at(-1)!.in_progress).toBe(true);
            }
        },
        HEAVY_MS,
    );

    test("the scenario cache hands out copies: edits never leak into it", () => {
        const a = buildScenario("full", TODAY);
        a.meals = [];
        a.profile = { ...a.profile, height_cm: null };
        const b = buildScenario("full", TODAY);
        expect(b.meals.length).toBeGreaterThan(0);
        expect(b.profile.height_cm).toBe(178);
    });
});

describe("preview scenarios say what they claim", () => {
    test("full: goals, body, two meals today, ≥2 weigh-ins in 30 days", () => {
        const d = payloadAt("full", 30);
        expect(d.goals?.calories).toBe(1800);
        expect(d.weightStats.missing).toEqual([]);
        expect(d.daily.at(-1)!.mealCount).toBe(2);
        expect(d.estimateVsScale.status).toBe("ok");
        expect(d.daily.filter((r) => r.mealCount === 0).length).toBeGreaterThan(
            0,
        );
        // A few treats, so the fifth meal type is reviewable in the preview.
        expect(d.meals.some((m) => m.meal_type === "treat")).toBe(true);
    });

    test("trend buckets per range: 7 daily, 4 weekly, 12 monthly", () => {
        expect(payloadAt("full", 7).trendBuckets).toHaveLength(7);
        const w = payloadAt("full", 30);
        expect(w.granularity).toBe("week");
        expect(w.trendBuckets).toHaveLength(4);
        expect(w.trendBuckets.at(-1)!.end).toBe(TODAY);
        const m = payloadAt("full", 365);
        expect(m.granularity).toBe("month");
        expect(m.trendBuckets).toHaveLength(12);
        expect(m.trendBuckets.at(-1)!.partial).toBe(true);
    });

    test("over-goal: today is 300 over and 5 of the last 7 days are over", () => {
        const d = payloadAt("over-goal", 7);
        const t = d.daily.at(-1)!;
        expect(t.calories - t.goal_calories!).toBeGreaterThanOrEqual(295);
        expect(t.calories - t.goal_calories!).toBeLessThanOrEqual(305);
        const over = d.daily.filter(
            (r) => r.goal_calories && r.calories > r.goal_calories,
        );
        expect(over).toHaveLength(5);
    });

    test("no-body: no burn, no balance anywhere, details missing", () => {
        const d = payloadAt("no-body", 30);
        expect(d.daily.every((r) => r.burn_kcal === null)).toBe(true);
        expect(d.daily.every((r) => r.balance_g === null)).toBe(true);
        expect(d.weightStats.missing).toEqual(["height", "birth_date", "sex"]);
        expect(d.estimateVsScale.status).toBe("no_estimate");
    });

    test("no-goals and empty", () => {
        expect(payloadAt("no-goals", 30).goals).toBeNull();
        const e = payloadAt("empty", 30);
        expect(e.goals).toBeNull();
        expect(e.meals).toEqual([]);
        expect(e.weights).toEqual([]);
        expect(e.estimateVsScale.status).toBe("no_weighins");
    });

    test("lb: pounds in Tokyo", () => {
        const d = payloadAt("lb", 30);
        expect(d.weightUnit).toBe("lb");
        expect(d.timezone).toBe("Asia/Tokyo");
    });

    test("calibrate: the estimate reads ~150 kcal/day high", () => {
        for (const days of [30, 90]) {
            const s = payloadAt("calibrate", days).estimateVsScale;
            expect(s.status).toBe("ok");
            expect(s.calibrated).toBe(true);
            expect(s.span_days!).toBeGreaterThanOrEqual(14);
            expect(s.implied_kcal_per_day!).toBeGreaterThan(120);
            expect(s.implied_kcal_per_day!).toBeLessThan(180);
        }
    });

    test("the preview sends the same CSP string as src/index.ts", async () => {
        // Read as text: importing the script would start its server.
        const preview = await Bun.file("scripts/dashboard-preview.ts").text();
        const index = await Bun.file("src/index.ts").text();
        const csp = /PREVIEW_CSP =\s*"([^"]+)"/.exec(preview)?.[1];
        expect(csp).toBeDefined();
        expect(index).toContain(`"${csp}"`);
    });

    test("deterministic: the same today renders the same page", () => {
        expect(JSON.stringify(payloadAt("full", 90))).toBe(
            JSON.stringify(payloadAt("full", 90)),
        );
    });
});
