import { describe, expect, test } from "bun:test";
import {
    checkMealItems,
    describeItems,
    removeItem,
    scaleItem,
    totalsFromItems,
    type MealItem,
} from "./meal-items.js";

const item = (name: string, extras: Partial<MealItem> = {}): MealItem => ({
    name,
    amount: 10,
    unit: "g",
    calories: 10,
    protein_g: 1,
    carbs_g: 2,
    fat_g: 3,
    source: "label",
    ...extras,
});

describe("meal items", () => {
    test("describes items with compact amounts and piece counts", () => {
        expect(
            describeItems([
                item("Rolled oats", { amount: 70, unit: "g" }),
                item("Clif Bar", { amount: 1, unit: "piece" }),
                item("Beans", { amount: 2, unit: "can" }),
                item("Crackers", { amount: 2, unit: "piece" }),
                item("Milk", { amount: 1.5, unit: "cup" }),
            ]),
        ).toBe(
            "Rolled oats (70 g) + Clif Bar (1) + Beans (2 cans) + Crackers (2) + Milk (1.5 cups)",
        );
    });
    test("sums totals, optional values, and common source", () => {
        expect(
            totalsFromItems([
                item("a", { fiber_g: 1 }),
                item("b", { calories: 11, fiber_g: 2 }),
            ]),
        ).toEqual({
            calories: 21,
            protein_g: 2,
            carbs_g: 4,
            fat_g: 6,
            fiber_g: 3,
            sugar_g: null,
            alcohol_g: null,
            caffeine_mg: null,
            sodium_mg: null,
            source: "label",
        });
    });
    test("optional totals are null only if no item has a value; source falls back to estimate", () => {
        expect(
            totalsFromItems([
                item("a", { fiber_g: 0, source: "label" }),
                item("b", { source: null }),
            ]),
        ).toMatchObject({ fiber_g: 0, sugar_g: null, source: "estimate" });
    });
    test("scales nutrients linearly and removes by valid index", () => {
        const scaled = scaleItem(item("a", { fiber_g: 2 }), 15);
        expect(scaled).toMatchObject({
            amount: 15,
            calories: 15,
            protein_g: 1.5,
            fiber_g: 3,
        });
        expect(removeItem([item("a"), item("b")], 0)).toHaveLength(1);
        expect(() => removeItem([item("a")], 1)).toThrow(RangeError);
    });
    test("validates item count and normalizes string fields/numbers", () => {
        expect(checkMealItems([item("a")]).ok).toBe(false);
        expect(
            checkMealItems(
                Array.from({ length: 21 }, (_, i) => item(String(i))),
            ).ok,
        ).toBe(false);
        const checked = checkMealItems([
            { ...item(" a "), amount: "2", unknown: true },
            item("b"),
        ]);
        expect(checked.ok && checked.value[0]).toMatchObject({
            name: "a",
            amount: 2,
        });
        if (checked.ok) expect(checked.value[0]).not.toHaveProperty("unknown");
    });
});
