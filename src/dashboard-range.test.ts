// Moving the Trends range back (`?end=`): the plotted range moves, every
// today-anchored figure stays exactly as it was. Pure fixture, no mock.module.
import { test, expect, describe } from "bun:test";
import {
    buildDashboardPayload,
    clampEnd,
    dashboardWindow,
    MAX_LOOKBACK_DAYS,
} from "./dashboard.js";
import {
    buildScenario,
    previewInputs,
    scenarioTz,
} from "./dashboard-fixture.js";
import { dateInTz, shiftLocalDate } from "./tz.js";

const TODAY = "2026-11-09";
const HEAVY_MS = 30_000;

describe("clampEnd", () => {
    test("a past day passes through", () => {
        expect(clampEnd("2026-10-01", TODAY)).toBe("2026-10-01");
    });
    test("today, the future, junk and impossible days read as today", () => {
        for (const raw of [
            undefined,
            "",
            TODAY,
            "2026-12-01",
            "yesterday",
            "2026-1-5",
            "2026-02-30",
            "2026-10-01T00:00",
        ])
            expect(clampEnd(raw, TODAY)).toBeUndefined();
    });
    test("past the lookback reads as today", () => {
        const floor = shiftLocalDate(TODAY, -MAX_LOOKBACK_DAYS);
        expect(clampEnd(floor, TODAY)).toBe(floor);
        expect(clampEnd(shiftLocalDate(floor, -1), TODAY)).toBeUndefined();
    });
});

describe("dashboardWindow with end", () => {
    test("no end is exactly today's window, in one span", () => {
        const w = dashboardWindow(TODAY, 7);
        expect(w.rangeEnd).toBe(TODAY);
        expect(w.startDate).toBe("2026-11-02");
        expect(w.fetchSpans).toEqual([[w.fetchStart, TODAY]]);
        expect(w.weightFetchSpans).toEqual([[w.weightFetchStart, TODAY]]);
    });

    test("a moved range is N complete days that tile with today's", () => {
        // Today's 7 days are Nov 2–8 plus the running Nov 9; the page
        // before ends Nov 1 and starts Oct 26.
        const w = dashboardWindow(TODAY, 7, "2026-11-01");
        expect(w.startDate).toBe("2026-10-26");
        expect(w.rangeEnd).toBe("2026-11-01");
        expect(w.endDate).toBe(TODAY);
    });

    test("far back, the range and today are fetched as two spans", () => {
        const w = dashboardWindow(TODAY, 30, "2024-06-30");
        expect(w.fetchSpans).toHaveLength(2);
        expect(w.fetchSpans[0]![1]).toBe("2024-06-30");
        expect(w.fetchSpans[1]![1]).toBe(TODAY);
        // Today's span is the unmoved request's, so today's figures match.
        expect(w.fetchSpans[1]![0]).toBe(dashboardWindow(TODAY, 30).fetchStart);
        expect(w.weightStart).toBe(dashboardWindow(TODAY, 30).weightStart);
    });

    test("close by, overlapping spans merge into one", () => {
        const w = dashboardWindow(TODAY, 7, "2026-11-01");
        expect(w.fetchSpans).toHaveLength(1);
        expect(w.fetchSpans[0]![1]).toBe(TODAY);
    });
});

describe("payload with a moved range", () => {
    for (const [days, end] of [
        [7, "2026-11-01"],
        [30, "2026-08-15"],
        [365, "2025-11-08"],
    ] as const)
        test(
            `days=${days}, end=${end}: range moves, today does not`,
            () => {
                const fx = buildScenario("full", TODAY);
                const tz = scenarioTz("full");
                const home = buildDashboardPayload(
                    previewInputs(fx, days, TODAY),
                );
                const moved = buildDashboardPayload(
                    previewInputs(fx, days, TODAY, end),
                );

                expect(moved.rangeEnd).toBe(end);
                expect(moved.endDate).toBe(TODAY);
                expect(moved.daily).toHaveLength(days);
                expect(moved.daily[0]!.date).toBe(moved.startDate);
                expect(moved.daily.at(-1)!.date).toBe(end);
                expect(moved.daily.some((r) => r.in_progress)).toBe(false);
                expect(moved.metabolism.map((p) => p.date)).toEqual(
                    moved.daily.map((r) => r.date),
                );
                for (const m of moved.meals) {
                    const d = dateInTz(m.logged_at, tz);
                    expect(d >= moved.startDate && d <= end).toBe(true);
                }
                for (const w of moved.rangeWeights)
                    expect(w.date >= moved.startDate && w.date <= end).toBe(
                        true,
                    );

                // Everything on today is the unmoved payload's, exactly.
                for (const key of [
                    "calibration",
                    "calibrationDetail",
                    "goalPlan",
                    "last7",
                    "weightStats",
                    "weights",
                    "weightWindowStart",
                    "waterToday",
                    "recentDays",
                    "todayMeals",
                    "estimateVsScale",
                    "setup",
                ] as const)
                    expect(moved[key]).toEqual(home[key]);
                expect(moved.recentDays.at(-1)!.date).toBe(TODAY);
                expect(moved.recentDays).toHaveLength(8);
            },
            HEAVY_MS,
        );

    test(
        "unmoved, recentDays is the tail of daily and rangeEnd is today",
        () => {
            const fx = buildScenario("full", TODAY);
            const p = buildDashboardPayload(previewInputs(fx, 30, TODAY));
            expect(p.rangeEnd).toBe(TODAY);
            expect(p.recentDays).toEqual(p.daily.slice(-8));
            expect(p.rangeWeights.every((w) => w.date >= p.startDate)).toBe(
                true,
            );
        },
        HEAVY_MS,
    );
});
