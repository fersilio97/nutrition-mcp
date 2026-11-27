import { describe, expect, test } from "bun:test";
import {
    LoomFoodError,
    foodGrams,
    itemForFood,
    itemForRecipe,
    setChildAmount,
    setServings,
    type LoomFood,
    type LoomRecipe,
} from "./loom-food.js";
import {
    checkMealItems,
    scaleItem,
    totalsFromItems,
    type MealItem,
} from "./meal-items.js";

// Shaped like loom#2's GET recipes/:slug: numerics arrive as strings, each
// line's figures are for its own quantity, and the batch makes 4 servings.
const tortilla: LoomRecipe = {
    id: "r-tortilla",
    slug: "tortilla-de-patata",
    title: "Tortilla de patata",
    servings: "4.00",
    derived: { complete: true, servings: "4.00" },
    ingredients: [
        {
            position: 1,
            name: "Patata",
            grams: "1000.00",
            food_id: "f-patata",
            macros_from: "food",
            kcal: "770.0",
            protein_g: "20.0",
            carbs_g: "170.0",
            fat_g: "1.0",
            fiber_g: "22.0",
            sugar_g: "8.0",
        },
        {
            position: 2,
            name: "Aceite de oliva",
            grams: "200.00",
            food_id: "f-aove",
            macros_from: "food",
            kcal: "1768.0",
            protein_g: "0.0",
            carbs_g: "0.0",
            fat_g: "200.0",
            fiber_g: "0.0",
            sugar_g: "0.0",
        },
        {
            position: 3,
            name: "Huevos",
            quantity: "8.00",
            unit: "piece",
            grams: "400.00",
            food_id: "f-huevo",
            macros_from: "food",
            kcal: "572.0",
            protein_g: "50.4",
            carbs_g: "2.8",
            fat_g: "38.0",
            fiber_g: "0.0",
            sugar_g: "1.6",
        },
        {
            position: 4,
            name: "Cebolla",
            grams: "200.00",
            food_id: "f-cebolla",
            macros_from: "food",
            kcal: "80.0",
            protein_g: "2.2",
            carbs_g: "18.6",
            fat_g: "0.2",
            fiber_g: "3.4",
            sugar_g: "8.4",
        },
        {
            position: 5,
            name: "Sal",
            negligible: true,
            macros_from: "negligible",
        },
    ],
};

const yogur: LoomFood = {
    id: "f-yogur",
    name: "Yogur griego natural",
    brand: "Kirkland Signature",
    store: "Costco",
    source: "label",
    kcal: "59.00",
    protein_g: "10.20",
    carbs_g: "3.60",
    fat_g: "0.40",
    fiber_g: "0.00",
    sugar_g: "3.20",
    default_amount: "125.00",
    default_unit: "g",
};

describe("Loom food → meal items", () => {
    test("reference: 2 servings of tortilla + 1 yogurt", () => {
        const t = itemForRecipe(tortilla, 2);
        const y = itemForFood(yogur);

        expect(t).toMatchObject({
            name: "Tortilla de patata",
            amount: 2,
            unit: "serving",
            source: "recipe",
            recipe_id: "r-tortilla",
            calories: 1595,
            fat_g: 119.6,
        });
        // salt is negligible, so it isn't a row
        expect(
            t.children!.map((c) => [c.name, c.amount, c.unit, c.calories]),
        ).toEqual([
            ["Patata", 500, "g", 385],
            ["Aceite de oliva", 100, "g", 884],
            ["Huevos", 200, "g", 286],
            ["Cebolla", 100, "g", 40],
        ]);

        expect(y).toMatchObject({
            name: "Yogur griego natural",
            amount: 125,
            unit: "g",
            calories: 73.8,
            protein_g: 12.75,
            store: "Costco",
            food_id: "f-yogur",
            source: "label",
        });

        expect(totalsFromItems([t, y])).toMatchObject({
            calories: 1669,
            protein_g: 49.1,
            source: "estimate", // recipe + label differ
        });
    });

    test("the parent is always the sum of its ingredients", () => {
        const t = itemForRecipe(tortilla, 2);
        const sum = t.children!.reduce((a, c) => a + c.calories, 0);
        expect(t.calories).toBe(sum);
    });

    test("changing servings scales every ingredient", () => {
        const one = setServings(itemForRecipe(tortilla, 2), 1);
        expect(one.amount).toBe(1);
        expect(one.calories).toBe(797.5);
        expect(one.children![0]).toMatchObject({
            name: "Patata",
            amount: 250,
            calories: 192.5,
        });
        // back up again lands on the original figures
        expect(setServings(one, 2).calories).toBe(1595);
    });

    test("incomplete ingredients fall back to the recipe's stored per-serving figures (local Loom, chilindrón)", () => {
        // Shape copied from the local Loom API: derived figures all null,
        // the recipe row still carrying the vault's 440 kcal per serving.
        const nulls = {
            kcal: null,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            fiber_g: null,
            sugar_g: null,
            sodium_mg: null,
            caffeine_mg: null,
            alcohol_g: null,
        };
        const chilindron: LoomRecipe = {
            id: "r-chil",
            slug: "pollo-al-chilindron",
            title: "Pollo al chilindrón",
            servings: "6.00",
            kcal: "440.0",
            protein_g: "45.0",
            carbs_g: "12.0",
            fat_g: "22.0",
            fiber_g: null,
            sugar_g: null,
            ingredients: [
                {
                    position: 1,
                    name: "contramuslos de pollo sin piel",
                    quantity: "1.50",
                    unit: "kg",
                    ...nulls,
                },
            ],
            derived: { complete: false, servings: "6.00", per_serving: nulls },
        };
        expect(itemForRecipe(chilindron, 2)).toMatchObject({
            name: "Pollo al chilindrón",
            amount: 2,
            unit: "serving",
            calories: 880,
            protein_g: 90,
            fiber_g: null,
        });
    });

    test("editing one ingredient updates the recipe line", () => {
        const lessOil = setChildAmount(itemForRecipe(tortilla, 2), 1, 50);
        expect(lessOil.children![1]).toMatchObject({
            amount: 50,
            calories: 442,
        });
        expect(lessOil.calories).toBe(1153);
        expect(() => setChildAmount(lessOil, 9, 10)).toThrow(RangeError);
    });

    test("scaleItem on a recipe line (the dashboard's amount edit) keeps the tree consistent", () => {
        const scaled = scaleItem(itemForRecipe(tortilla, 2), 3);
        expect(scaled.children![0]!.amount).toBe(750);
        expect(scaled.calories).toBe(
            scaled.children!.reduce((a, c) => a + c.calories, 0),
        );
    });

    test("an incomplete recipe is one serving line, never a half-filled tree", () => {
        // Partly linked: eggs counted, potatoes missing. The partial sum
        // (150 kcal) must never be used; the stored row figures (440) are.
        const partial: LoomRecipe = {
            ...tortilla,
            kcal: "440",
            protein_g: "30",
            carbs_g: "20",
            fat_g: "25",
            derived: {
                complete: false,
                servings: "4",
                per_serving: { kcal: "150", protein_g: "12" },
            },
        };
        const item = itemForRecipe(partial, 1.5);
        expect(item.children).toBeUndefined();
        expect(item).toMatchObject({
            amount: 1.5,
            unit: "serving",
            calories: 660,
            protein_g: 45,
        });

        const none: LoomRecipe = { ...tortilla, derived: { complete: false } };
        expect(() => itemForRecipe(none, 1)).toThrow(LoomFoodError);
    });

    test("food amounts in pieces and ml need the catalog's conversions", () => {
        const clif: LoomFood = {
            id: "f-clif",
            name: "Clif Bar",
            kcal: "367.6",
            grams_per_piece: "68",
        };
        expect(foodGrams(clif, 1, "piece")).toBe(68);
        expect(itemForFood(clif, 1, "piece").calories).toBe(250);
        expect(() => foodGrams(clif, 100, "ml")).toThrow(LoomFoodError);
        expect(() => itemForFood(clif)).toThrow(/typical portion/);
        const kefir: LoomFood = {
            id: "f-kefir",
            name: "Kéfir",
            kcal: 61,
            ml_to_g: "1.03",
        };
        expect(itemForFood(kefir, 150, "ml").calories).toBe(94.2);
    });
});

describe("checkMealItems with ingredients", () => {
    const tree = (): MealItem => itemForRecipe(tortilla, 2);

    test("a tree round-trips, and the parent is recomputed from its ingredients", () => {
        const sent = { ...tree(), calories: 5 }; // a client can't make the parent disagree
        const checked = checkMealItems([sent]);
        expect(checked.ok).toBe(true);
        if (!checked.ok) return;
        expect(checked.value[0]!.calories).toBe(1595);
        expect(checked.value[0]!.children).toHaveLength(4);
        expect(checked.value[0]!.recipe_id).toBe("r-tortilla");
    });

    test("ingredients can't have ingredients", () => {
        const deep = { ...tree(), children: [{ ...tree() }] };
        const checked = checkMealItems([deep]);
        expect(checked.ok).toBe(false);
    });
});
