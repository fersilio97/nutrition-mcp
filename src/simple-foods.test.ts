import { describe, expect, test } from "bun:test";
import {
    FOOD_ENTRIES,
    foodMatchFor,
    listFoods,
    matchFood,
    suggestFood,
} from "./simple-foods.js";
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
        expect(two.description).toBe("2 × Beer (Can 355 ml)");
        expect(two.values.calories).toBe(one.calories * 2);
        expect(two.values.alcohol_g).toBe(Math.round(one.alcohol_g! * 20) / 10);
        expect(matchFood("dos cervezas")?.count).toBe(2);
        expect(matchFood("3 x espresso")?.values.caffeine_mg).toBe(189);
        expect(matchFood("2 wines")?.id).toBe("wine-red");
        expect(matchFood("0 beers")).toBeNull();
        expect(matchFood("13 beers")).toBeNull();
    });

    test("the amount matters: half a litre of beer is not a can", () => {
        const can = foodMatchFor("beer")!;
        const half = foodMatchFor("beer", 500)!;
        const pint = foodMatchFor("beer", 473)!;
        expect(can.amount).toBe(355);
        expect(can.values.calories).toBe(153);
        expect(half.values.calories).toBe(Math.round((153 * 500) / 355));
        expect(half.values.alcohol_g).toBe(
            Math.round(((13.9 * 500) / 355) * 10) / 10,
        );
        expect(half.description).toBe("Beer (Half litre 500 ml)");
        expect(pint.description).toBe("Beer (Pint 473 ml)");
        // An amount that is not a listed serving is labelled with its size.
        expect(foodMatchFor("beer", 400)!.description).toBe("Beer (400 ml)");
        // Amount × count.
        expect(foodMatchFor("beer", 500, 2)!.values.calories).toBe(
            Math.round(((153 * 500) / 355) * 2),
        );
        expect(foodMatchFor("wine-red", 750)!.values.alcohol_g).toBe(78);
    });

    test("units: olive oil by the spoon or by the millilitre gives the same nutrients", () => {
        const tbsp = foodMatchFor("olive-oil", 1, 1, "tbsp")!;
        const ml = foodMatchFor("olive-oil", 15, 1, "ml")!;
        expect(tbsp.values).toEqual(ml.values);
        expect(tbsp.values.calories).toBe(119);
        expect(tbsp.values.fat_g).toBe(13.5);
        expect(foodMatchFor("olive-oil", 2, 1, "tbsp")!.values.calories).toBe(
            238,
        );
        expect(foodMatchFor("olive-oil", 1, 1, "tsp")!.values.calories).toBe(
            40,
        );
        // The default is the base unit; the named serving keeps its name.
        expect(foodMatchFor("olive-oil")!.unit).toBe("ml");
        expect(foodMatchFor("olive-oil")!.description).toBe(
            "Olive oil (1 tbsp)",
        );
        expect(tbsp.baseAmount).toBe(15);
        expect(tbsp.unit).toBe("tbsp");
        expect(tbsp.amount).toBe(1);
        // In its own unit a non-serving amount is labelled with that unit.
        expect(foodMatchFor("olive-oil", 1.5, 1, "tbsp")!.description).toBe(
            "Olive oil (1.5 tbsp)",
        );
    });

    test("units: fluid ounces for drinks, grams for a banana", () => {
        const oz = foodMatchFor("beer", 12, 1, "fl oz")!;
        expect(oz.baseAmount).toBeCloseTo(354.88, 2);
        expect(oz.description).toBe("Beer (12 fl oz)");
        expect(oz.values.calories).toBe(153);
        expect(foodMatchFor("wine-red", 5, 1, "fl oz")!.values.calories).toBe(
            123,
        );
        const g = foodMatchFor("banana", 59, 1, "g")!;
        expect(g.values.calories).toBe(53);
        expect(g.description).toBe("Banana (59 g)");
        expect(foodMatchFor("coffee-black", 1, 1, "cup")!.values.calories).toBe(
            2,
        );
    });

    test("an item only offers its own units; bad units are refused", () => {
        expect(foodMatchFor("beer", 1, 1, "tbsp")).toBeNull();
        expect(foodMatchFor("olive-oil", 1, 1, "cup")).toBeNull();
        expect(foodMatchFor("beer", 355, 1, "nope")).toBeNull();
        // The cap applies to the base amount: 200 tbsp is 3 litres of oil.
        expect(foodMatchFor("olive-oil", 400, 1, "tbsp")).toBeNull();
        expect(foodMatchFor("beer")!.units.map((u) => u.id)).toEqual([
            "ml",
            "fl oz",
        ]);
        expect(foodMatchFor("olive-oil")!.units.map((u) => u.id)).toEqual([
            "ml",
            "tbsp",
            "tsp",
        ]);
        expect(
            suggestFood({ id: "olive-oil", amount: "2", unit: "tbsp" })?.values
                .calories,
        ).toBe(238);
    });

    test("out-of-range amounts and counts, and unknown items, are refused", () => {
        for (const args of [
            ["beer", 0],
            ["beer", -5],
            ["beer", 5001],
            ["beer", Number.NaN],
            ["beer", 355, 0],
            ["beer", 355, 13],
            ["beer", 355, 1.5],
            ["banana", 21],
        ] as [string, number, number?][])
            expect(foodMatchFor(...args)).toBeNull();
        expect(foodMatchFor("nope")).toBeNull();
    });

    test("suggestFood: an item by id (query-string values) or free text", () => {
        expect(suggestFood({ id: "beer", amount: "500", count: "2" })).toEqual(
            foodMatchFor("beer", 500, 2),
        );
        expect(suggestFood({ id: "beer" })?.amount).toBe(355);
        expect(suggestFood({ id: "beer", amount: "abc" })).toBeNull();
        expect(suggestFood({ q: "2 beers" })?.count).toBe(2);
        expect(suggestFood({ q: "pasta" })).toBeNull();
        expect(suggestFood({})).toBeNull();
    });

    test("every item is listed with a default serving that is one of its servings", () => {
        const list = listFoods();
        expect(list).toHaveLength(FOOD_ENTRIES.length);
        for (const f of list) {
            expect(f.servings.some((s) => s.amount === f.amount)).toBe(true);
            expect(foodMatchFor(f.id)?.amount).toBe(f.amount);
            // Every listed serving is itself a valid amount.
            for (const s of f.servings)
                expect(foodMatchFor(f.id, s.amount)).not.toBeNull();
        }
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
