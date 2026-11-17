import { describe, expect, test } from "bun:test";
import {
    checkLoggedServings,
    checkRecipe,
    findRecipe,
    formatRecipe,
    recipeMealDescription,
    scaleRecipe,
    type Recipe,
} from "./recipes.js";

const base = {
    name: "Overnight oats",
    calories: 420,
    protein_g: 18,
    carbs_g: 55,
    fat_g: 12.4,
    fiber_g: 8,
};

describe("checkRecipe", () => {
    test("per-serving figures pass through; unknown nutrients stay null, never 0", () => {
        const r = checkRecipe(base);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.servings).toBe(1);
        expect(r.value.calories).toBe(420);
        expect(r.value.sugar_g).toBeNull();
        expect(r.value.sodium_mg).toBeNull();
        expect(r.value.ingredients).toEqual([]);
    });

    test("batch figures are divided by servings", () => {
        const r = checkRecipe({
            name: "Lentil stew",
            servings: 4,
            per: "batch",
            calories: 1800,
            protein_g: 110,
            sodium_mg: 2400,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.calories).toBe(450);
        expect(r.value.protein_g).toBe(27.5);
        expect(r.value.sodium_mg).toBe(600);
    });

    test("rejects what cannot be a dish", () => {
        expect(checkRecipe({ ...base, name: "  " }).ok).toBe(false);
        expect(checkRecipe({ ...base, calories: undefined }).ok).toBe(false);
        expect(checkRecipe({ ...base, protein_g: -1 }).ok).toBe(false);
        expect(checkRecipe({ ...base, servings: 0 }).ok).toBe(false);
        expect(checkRecipe({ ...base, calories: 9000 }).ok).toBe(false);
        expect(checkRecipe({ ...base, per: "pot" }).ok).toBe(false);
        expect(checkRecipe({ ...base, ingredients: "oats" }).ok).toBe(false);
    });

    test("cleans the ingredient list", () => {
        const r = checkRecipe({
            ...base,
            ingredients: [" oats 50 g ", "", 3, "milk 200 ml"],
        });
        expect(r.ok && r.value.ingredients).toEqual([
            "oats 50 g",
            "milk 200 ml",
        ]);
    });
});

describe("scaling and logging", () => {
    test("scales every known figure and keeps unknowns unknown", () => {
        const r = checkRecipe(base);
        if (!r.ok) throw new Error(r.error);
        const s = scaleRecipe(r.value, 1.5);
        expect(s.calories).toBe(630);
        expect(s.fat_g).toBe(18.6);
        expect(s.sugar_g).toBeNull();
    });

    test("servings are bounded and default to 1", () => {
        expect(checkLoggedServings(undefined)).toEqual({ ok: true, value: 1 });
        expect(checkLoggedServings("1.5")).toEqual({ ok: true, value: 1.5 });
        expect(checkLoggedServings(0).ok).toBe(false);
        expect(checkLoggedServings(21).ok).toBe(false);
        expect(checkLoggedServings("lots").ok).toBe(false);
    });

    test("descriptions say the amount", () => {
        expect(recipeMealDescription("Oats", 1)).toBe("Oats (1 serving)");
        expect(recipeMealDescription("Oats", 1.5)).toBe("Oats (1.5 servings)");
    });
});

describe("findRecipe", () => {
    const list = [
        { id: "a", name: "Overnight oats" },
        { id: "b", name: "Overnight oats with peanut butter" },
    ];
    test("matches a whole name regardless of case and spacing, or an id", () => {
        expect(findRecipe(list, "  overnight   OATS ")?.id).toBe("a");
        expect(findRecipe(list, "b")?.id).toBe("b");
    });
    test("never matches a substring", () => {
        expect(findRecipe(list, "oats")).toBeNull();
        expect(findRecipe(list, "")).toBeNull();
    });
});

test("formatRecipe lists per-serving figures and the id", () => {
    const r: Recipe = {
        id: "r1",
        user_id: "u1",
        name: "Oats",
        servings: 2,
        ingredients: ["oats", "milk"],
        calories: 400,
        protein_g: 15,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
        sugar_g: null,
        sodium_mg: null,
        caffeine_mg: null,
        created_at: "",
        updated_at: "",
    };
    expect(formatRecipe(r)).toBe(
        "- Oats (makes 2 servings; per serving: 400 kcal, 15 g protein) [id r1] — oats, milk",
    );
});
