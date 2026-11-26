// repeatFields is pure, so no mock.module here (see CLAUDE.md on mock windows).
import { test, expect, describe } from "bun:test";
import { repeatFields } from "./dashboard.js";
import type { Meal } from "./supabase.js";

const ITEMS = [
    { name: "Greek yogurt", amount: 275, unit: "g", calories: 160 },
    { name: "Raspberries", amount: 30, unit: "g", calories: 15 },
    { name: "Pumpkin seeds", amount: 20, unit: "g", calories: 110 },
    { name: "Oats", amount: 30, unit: "g", calories: 115 },
];

const source = {
    id: "00000000-0000-4000-8000-000000000001",
    description: "Desayuno: yogur griego, frambuesas, pipas, avena",
    meal_type: "breakfast",
    calories: 400,
    protein_g: 30,
    items: ITEMS,
    items_label: "Desayuno",
} as unknown as Meal;

describe("repeatFields", () => {
    test("carries the per-food items and their label", () => {
        const copy = repeatFields(source, {});
        expect(copy.items).toEqual(ITEMS);
        expect(copy.items_label).toBe("Desayuno");
    });

    test("copies the items instead of sharing the source's array", () => {
        const copy = repeatFields(source, {});
        expect(copy.items).not.toBe(source.items);
        expect(copy.items![0]).not.toBe(source.items![0]);
    });

    test("a meal without items stays flat", () => {
        const flat = { ...source, items: null, items_label: null } as Meal;
        const copy = repeatFields(flat, {});
        expect(copy.items).toBeUndefined();
        expect(copy.items_label).toBeUndefined();
    });
});
