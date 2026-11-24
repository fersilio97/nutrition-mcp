// Saved recipes (vault feature 009, UX audit 2026-11-16).
//
// A recipe is a named dish the user makes repeatedly, stored PER SERVING so
// "overnight oats, 1.5 servings" is one multiplication instead of the model
// re-estimating the same bowl differently every morning. Pure: validation,
// scaling and lookup live here, unit-tested; src/mcp.ts (manage_recipes,
// log_meal's `recipe`) and src/dashboard.ts (/api/dashboard/recipes) are thin
// adapters over src/supabase.ts — the src/import.ts pattern.

import {
    checkMealItems,
    totalsFromItems,
    type MealItem,
} from "./meal-items.js";

export const RECIPE_NUTRIENTS = [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "caffeine_mg",
] as const;
export type RecipeNutrient = (typeof RECIPE_NUTRIENTS)[number];
export type RecipeNutrients = Record<RecipeNutrient, number | null>;

/** Upper bounds per serving; past these it is a unit mix-up, not a dish. */
const MAX: Record<RecipeNutrient, number> = {
    calories: 5000,
    protein_g: 500,
    carbs_g: 1000,
    fat_g: 500,
    fiber_g: 200,
    sugar_g: 1000,
    sodium_mg: 20000,
    caffeine_mg: 2000,
};
export const MAX_RECIPE_SERVINGS = 100;
/** One logged portion can be a lot of a batch, but not more than this. */
export const MAX_LOGGED_SERVINGS = 20;
const MAX_INGREDIENTS = 50;

export interface Recipe extends RecipeNutrients {
    id: string;
    user_id: string;
    name: string;
    /** How many servings the recipe makes. Nutrients are PER SERVING. */
    servings: number;
    ingredients: string[];
    ingredient_items: MealItem[] | null;
    created_at: string;
    updated_at: string;
}

export interface RecipeDraft extends RecipeNutrients {
    name: string;
    servings: number;
    ingredients: string[];
    ingredient_items: MealItem[] | null;
}

export interface RecipeInput {
    name?: unknown;
    servings?: unknown;
    /** "serving" (default): the figures are for one serving. "batch": they are
     *  for the whole recipe and get divided by `servings` — what a user reading
     *  a whole pot's ingredients actually knows. */
    per?: unknown;
    ingredients?: unknown;
    ingredient_items?: unknown;
    [k: string]: unknown;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const round = (n: number, dp: number) => {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
};
/** kcal and mg whole, grams to a tenth — the precision the rest of the app shows. */
const dpOf = (k: RecipeNutrient) =>
    k === "calories" || k.endsWith("_mg") ? 0 : 1;

function num(v: unknown): number | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
}

export function checkRecipe(input: RecipeInput): Checked<RecipeDraft> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 1 || name.length > 120)
        return { ok: false, error: "name must be 1–120 characters" };
    const servingsRaw = num(input.servings);
    const servings = servingsRaw == null ? 1 : servingsRaw;
    if (!(servings > 0) || servings > MAX_RECIPE_SERVINGS)
        return {
            ok: false,
            error: `servings must be more than 0 and at most ${MAX_RECIPE_SERVINGS}`,
        };
    let ingredientItems: MealItem[] | null = null;
    if (
        input.ingredient_items !== undefined &&
        input.ingredient_items !== null
    ) {
        const checked = checkMealItems(input.ingredient_items, 50);
        if (!checked.ok) return checked;
        ingredientItems = checked.value;
    }
    const per = input.per ?? "serving";
    if (!ingredientItems && per !== "serving" && per !== "batch")
        return { ok: false, error: "per must be 'serving' or 'batch'" };
    const divisor = per === "batch" ? servings : 1;

    const nutrients = {} as RecipeNutrients;
    for (const k of RECIPE_NUTRIENTS) {
        if (ingredientItems) continue;
        const v = num(input[k]);
        if (v === undefined || v === null) {
            // Blank means "not known", never 0 — a stored 0 is a fake
            // measurement (same rule as the dashboard's meal form).
            nutrients[k] = null;
            continue;
        }
        if (Number.isNaN(v) || v < 0)
            return { ok: false, error: `${k} must be a number ≥ 0` };
        const perServing = v / divisor;
        if (perServing > MAX[k])
            return {
                ok: false,
                error: `${k} of ${round(perServing, 1)} per serving is implausible (max ${MAX[k]})`,
            };
        nutrients[k] = round(perServing, dpOf(k));
    }
    if (ingredientItems) {
        const totals = totalsFromItems(ingredientItems);
        for (const k of RECIPE_NUTRIENTS) {
            const v = totals[k as keyof typeof totals];
            nutrients[k] =
                typeof v !== "number" ? null : round(v / servings, dpOf(k));
            if (nutrients[k] != null && nutrients[k]! > MAX[k])
                return {
                    ok: false,
                    error: `${k} of ${nutrients[k]} per serving is implausible (max ${MAX[k]})`,
                };
        }
    }
    if (nutrients.calories == null)
        return {
            ok: false,
            error: "calories are required — a recipe without them cannot count toward a goal",
        };

    let ingredients: string[] = [];
    if (input.ingredients !== undefined && input.ingredients !== null) {
        if (!Array.isArray(input.ingredients))
            return {
                ok: false,
                error: "ingredients must be a list of strings",
            };
        ingredients = input.ingredients
            .map((i) => (typeof i === "string" ? i.trim() : ""))
            .filter((i) => i.length > 0)
            .map((i) => i.slice(0, 120));
        if (ingredients.length > MAX_INGREDIENTS)
            return {
                ok: false,
                error: `at most ${MAX_INGREDIENTS} ingredients`,
            };
    }
    return {
        ok: true,
        value: {
            name,
            servings: round(servings, 2),
            ingredients,
            ingredient_items: ingredientItems,
            ...nutrients,
        },
    };
}

export function checkLoggedServings(v: unknown): Checked<number> {
    const n = num(v);
    const servings = n == null ? 1 : n;
    if (
        Number.isNaN(servings) ||
        !(servings > 0) ||
        servings > MAX_LOGGED_SERVINGS
    )
        return {
            ok: false,
            error: `servings must be more than 0 and at most ${MAX_LOGGED_SERVINGS}`,
        };
    return { ok: true, value: round(servings, 2) };
}

/** A recipe's figures for `servings` portions. A null stays null: unknown
 *  times 1.5 is still unknown, not 0. */
export function scaleRecipe(
    recipe: RecipeNutrients,
    servings: number,
): RecipeNutrients {
    const out = {} as RecipeNutrients;
    for (const k of RECIPE_NUTRIENTS) {
        const v = recipe[k];
        out[k] = v == null ? null : round(v * servings, dpOf(k));
    }
    return out;
}

/** "Overnight oats (1 serving)", "Overnight oats (1.5 servings)". The amount
 *  rides in the description so later searches are self-describing, as the
 *  dashboard's simple foods already do. */
export function recipeMealDescription(name: string, servings: number): string {
    return `${name} (${servings} serving${servings === 1 ? "" : "s"})`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** By id, or by WHOLE name (case- and spacing-insensitive). Never a substring:
 *  "oats" must not silently log "overnight oats with peanut butter". */
export function findRecipe<R extends { id: string; name: string }>(
    recipes: R[],
    query: string,
): R | null {
    const q = query.trim();
    if (q === "") return null;
    return (
        recipes.find((r) => r.id === q) ??
        recipes.find((r) => norm(r.name) === norm(q)) ??
        null
    );
}

/** One line per recipe for the model: name, servings made, per-serving figures. */
export function formatRecipe(r: Recipe): string {
    const parts = [
        `${Math.round(r.calories ?? 0)} kcal`,
        r.protein_g != null ? `${r.protein_g} g protein` : null,
        r.carbs_g != null ? `${r.carbs_g} g carbs` : null,
        r.fat_g != null ? `${r.fat_g} g fat` : null,
        r.fiber_g != null ? `${r.fiber_g} g fiber` : null,
        r.sugar_g != null ? `${r.sugar_g} g sugar` : null,
        r.sodium_mg != null ? `${r.sodium_mg} mg sodium` : null,
        r.caffeine_mg != null ? `${r.caffeine_mg} mg caffeine` : null,
    ].filter((p): p is string => p !== null);
    const made = `makes ${r.servings} serving${r.servings === 1 ? "" : "s"}`;
    const measured = r.ingredient_items?.length
        ? r.ingredient_items
              .map((i) => `${i.name} ${i.amount} ${i.unit}`)
              .join(", ")
        : "";
    const ing = measured
        ? ` — ${measured}`
        : r.ingredients.length
          ? ` — ${r.ingredients.join(", ")}`
          : "";
    return `- ${r.name} (${made}; per serving: ${parts.join(", ")}) [id ${r.id}]${ing}`;
}
