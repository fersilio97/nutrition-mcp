import { describe, expect, test } from "bun:test";
import { FOOD_ENTRIES, matchFood } from "./simple-foods.js";
import { buildFrequentMeals } from "./dashboard-stats.js";
import type { Meal } from "./supabase.js";

describe("matchFood", () => {
    test("a black coffee, however it is phrased, fills caffeine and zeros", () => {
        for (const d of [
            "Coffee",
            "coffee, solo",
            "Café solo",
            "a cup of coffee",
            "  BLACK  COFFEE ",
            "una taza de café",
        ]) {
            const m = matchFood(d);
            expect(m?.id).toBe("coffee-black");
            expect(m?.values).toMatchObject({
                calories: 2,
                fiber_g: 0,
                sugar_g: 0,
                caffeine_mg: 95,
            });
        }
    });

    test("only a whole-description match counts: other coffee things are not black coffee", () => {
        for (const d of [
            "coffee ice cream",
            "Coffee with whey and oats",
            "coffee cake",
            "wine-braised chicken",
            "",
            "   ",
            "beer battered fish",
        ])
            expect(matchFood(d)).toBeNull();
    });

    test("alcohol drinks carry alcohol and no caffeine key", () => {
        const beer = matchFood("beer")!;
        expect(beer.values.alcohol_g).toBeGreaterThan(10);
        expect("caffeine_mg" in beer.values).toBe(false);
        expect(matchFood("a glass of wine")?.id).toBe("wine-red");
        expect(matchFood("white wine")?.id).toBe("wine-white");
        expect(matchFood("copa de vino blanco")?.id).toBe("wine-white");
        expect(matchFood("whisky")?.values.alcohol_g).toBe(14);
    });

    test("a leading count multiplies, plurals and Spanish count words work", () => {
        const one = matchFood("beer")!.values;
        const two = matchFood("2 beers")!;
        expect(two.count).toBe(2);
        expect(two.name.startsWith("2 × ")).toBe(true);
        expect(two.values.calories).toBe(one.calories * 2);
        expect(two.values.alcohol_g).toBe(Math.round(one.alcohol_g! * 20) / 10);
        expect(matchFood("dos cervezas")?.count).toBe(2);
        expect(matchFood("3 x espresso")?.values.caffeine_mg).toBe(189);
        expect(matchFood("2 wines")?.id).toBe("wine-red");
        expect(matchFood("0 beers")).toBeNull();
        expect(matchFood("13 beers")).toBeNull();
    });

    test("every entry sets fiber and sugar, and no alias is shared", () => {
        const seen = new Set<string>();
        for (const f of FOOD_ENTRIES) {
            expect(typeof f.fiber_g).toBe("number");
            expect(typeof f.sugar_g).toBe("number");
            for (const a of f.aliases) {
                expect(seen.has(a)).toBe(false);
                seen.add(a);
                // Each alias resolves to its own entry.
                expect(matchFood(a)?.id).toBe(f.id);
            }
        }
    });
});

describe("buildFrequentMeals", () => {
    const m = (id: string, description: string, at: string, kcal = 100) =>
        ({
            id,
            description,
            meal_type: "snack",
            calories: kcal,
            logged_at: at,
        }) as unknown as Meal;

    test("counts by description from the user's own logs, most frequent first, once is not frequent", () => {
        const out = buildFrequentMeals([
            m("c1", "Coffee, solo", "2026-11-01T08:00:00Z", 2),
            m("b1", "Beer", "2026-11-02T20:00:00Z", 153),
            m("c2", " coffee, SOLO ", "2026-11-02T08:00:00Z", 2),
            m("c3", "Coffee, solo", "2026-11-03T08:00:00Z", 2),
            m("b2", "Beer", "2026-11-03T20:00:00Z", 153),
            m("x1", "One-off pasta", "2026-11-03T13:00:00Z", 700),
        ]);
        expect(out.map((f) => [f.description, f.count])).toEqual([
            ["Coffee, solo", 3],
            ["Beer", 2],
        ]);
    });

    test("a tap repeats the newest instance; ties go to the more recent", () => {
        const out = buildFrequentMeals([
            m("old", "Oats", "2026-11-01T08:00:00Z", 400),
            m("new", "Oats", "2026-11-05T08:00:00Z", 420),
            m("t1", "Tea", "2026-11-06T08:00:00Z"),
            m("t2", "Tea", "2026-11-07T08:00:00Z"),
        ]);
        expect(out[0]).toMatchObject({ description: "Tea", count: 2 });
        expect(out[1]).toMatchObject({ id: "new", calories: 420, count: 2 });
    });

    test("respects the limit and ignores blank descriptions", () => {
        const many = Array.from({ length: 20 }, (_, i) => [
            m(`a${i}`, `Meal ${i}`, "2026-11-01T08:00:00Z"),
            m(`b${i}`, `Meal ${i}`, "2026-11-02T08:00:00Z"),
        ]).flat();
        many.push(m("z", "  ", "2026-11-01T00:00:00Z"));
        many.push(m("z2", "  ", "2026-11-02T00:00:00Z"));
        expect(buildFrequentMeals(many, 5)).toHaveLength(5);
        expect(
            buildFrequentMeals(many).every((f) => f.description.trim() !== ""),
        ).toBe(true);
    });
});
