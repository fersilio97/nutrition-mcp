import { test, expect, describe } from "bun:test";
import {
    ageOn,
    bmi,
    bmiCategory,
    healthyRangeG,
    bmrMifflin,
    bmrFor,
    dailyBurn,
    balanceGrams,
    weightOn,
    weightTrend,
    projectTargetDate,
    checkBodyPatch,
} from "./body.js";

describe("basic formulas", () => {
    test("ageOn counts the birthday itself", () => {
        expect(ageOn("1997-11-10", "2026-11-09")).toBe(28);
        expect(ageOn("1997-11-10", "2026-11-10")).toBe(29);
        expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    });

    test("BMI and its WHO category", () => {
        expect(bmi(80_000, 178)).toBe(25.2);
        expect(bmiCategory(18.4)).toBe("underweight");
        expect(bmiCategory(18.5)).toBe("healthy");
        expect(bmiCategory(24.99)).toBe("healthy");
        expect(bmiCategory(25)).toBe("overweight");
        expect(bmiCategory(30)).toBe("obese");
    });

    test("healthy range is BMI 18.5–24.9 at the height", () => {
        expect(healthyRangeG(178)).toEqual({ min: 58_615, max: 78_893 });
    });

    test("Mifflin-St Jeor, both constants", () => {
        // 10·80 + 6.25·178 − 5·30 = 1762.5
        expect(bmrMifflin(80_000, 178, 30, "male")).toBe(1768);
        expect(bmrMifflin(80_000, 178, 30, "female")).toBe(1602);
    });

    test("burn = BMR × 1.2 + active, balance at 7.7 kcal/g", () => {
        expect(dailyBurn(1768, null)).toBe(2122);
        expect(dailyBurn(1768, 300)).toBe(2422);
        expect(balanceGrams(2422, 2422)).toBe(0);
        expect(balanceGrams(1652, 2422)).toBe(-100);
        expect(balanceGrams(2807, 2422)).toBe(50);
    });

    test("bmrFor needs every detail and a weight", () => {
        const body = {
            height_cm: 178,
            birth_date: "1996-01-01",
            sex: "male" as const,
        };
        expect(bmrFor(body, 80_000, "2026-11-09")).toBe(1768);
        expect(bmrFor(body, null, "2026-11-09")).toBeNull();
        expect(bmrFor({ ...body, sex: null }, 80_000, "2026-11-09")).toBeNull();
        expect(
            bmrFor({ ...body, height_cm: null }, 80_000, "2026-11-09"),
        ).toBeNull();
    });
});

describe("weight over time", () => {
    const w = [
        { date: "2026-10-01", weight_g: 82_000 },
        { date: "2026-10-08", weight_g: 81_500 },
        { date: "2026-10-15", weight_g: 81_000 },
        { date: "2026-10-22", weight_g: 80_500 },
    ];

    test("weightOn carries the last reading forward, the first one back", () => {
        expect(weightOn(w, "2026-10-10")).toBe(81_500);
        expect(weightOn(w, "2026-10-22")).toBe(80_500);
        expect(weightOn(w, "2026-12-01")).toBe(80_500);
        expect(weightOn(w, "2026-09-01")).toBe(82_000);
        expect(weightOn([], "2026-10-10")).toBeNull();
    });

    test("trend: change and least-squares weekly rate", () => {
        expect(weightTrend(w)).toEqual({
            change_g: -1_500,
            weekly_rate_g: -500,
            span_days: 21,
        });
        expect(weightTrend(w.slice(0, 1))).toBeNull();
        expect(weightTrend([w[0]!, { ...w[0]!, weight_g: 81_000 }])).toBeNull();
    });

    test("projection only when the rate points at the target", () => {
        const latest = w[3]!;
        // 500 g to go at −500 g/week → 7 days.
        expect(projectTargetDate(latest, 80_000, -500)).toBe("2026-10-29");
        expect(projectTargetDate(latest, 85_000, -500)).toBeNull();
        expect(projectTargetDate(latest, 80_000, 0)).toBeNull();
        expect(projectTargetDate(latest, 80_500, -500)).toBe("2026-10-22");
        // 30 kg at 100 g/week is ~5.8 years — not a forecast.
        expect(projectTargetDate(latest, 50_500, -100)).toBeNull();
    });
});

describe("checkBodyPatch", () => {
    const today = "2026-11-09";

    test("accepts cm, converts inches, and leaves omitted fields alone", () => {
        expect(checkBodyPatch({ height: 178 }, today)).toEqual({
            ok: true,
            patch: { height_cm: 178 },
        });
        expect(
            checkBodyPatch({ height: "70", height_unit: "in" }, today),
        ).toEqual({ ok: true, patch: { height_cm: 177.8 } });
        expect(
            checkBodyPatch({ birth_date: "1997-03-04", sex: "male" }, today),
        ).toEqual({
            ok: true,
            patch: { birth_date: "1997-03-04", sex: "male" },
        });
    });

    test("null clears a field", () => {
        expect(checkBodyPatch({ height: null, sex: null }, today)).toEqual({
            ok: true,
            patch: { height_cm: null, sex: null },
        });
    });

    test("rejects implausible values with a readable message", () => {
        expect(checkBodyPatch({ height: 5.9 }, today).ok).toBe(false); // feet
        expect(checkBodyPatch({ height: "abc" }, today).ok).toBe(false);
        expect(
            checkBodyPatch({ height: 70, height_unit: "ft" }, today).ok,
        ).toBe(false);
        expect(checkBodyPatch({ birth_date: "1997-02-30" }, today).ok).toBe(
            false,
        );
        expect(checkBodyPatch({ birth_date: "2030-01-01" }, today).ok).toBe(
            false,
        );
        expect(checkBodyPatch({ birth_date: "2020-01-01" }, today).ok).toBe(
            false,
        );
        expect(checkBodyPatch({ sex: "other" }, today).ok).toBe(false);
    });
});
