/**
 * Turns Loom's shared food database (loom#2: `food.foods`, recipes with
 * per-ingredient figures) into meal items, so the server, not the model,
 * adds up a meal like "2 raciones de tortilla de patata y 1 yogur".
 *
 * Pure: no network, no Supabase. The caller fetches the recipe or food from
 * Loom (`GET …/recipes/:slug`, `GET …/foods/:id`) and passes the parsed row.
 *
 * A logged meal keeps a COPY of the figures as they were when it was logged
 * (recipe_id / food_id only record where they came from), so editing a recipe
 * in Loom later never rewrites a past day.
 */
import {
    scaleItemBy,
    sumOfChildren,
    type MealItem,
    type MealItemSource,
} from "./meal-items.js";

const NUTRIENTS = [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "alcohol_g",
    "caffeine_mg",
    "sodium_mg",
] as const;
type Nutrient = (typeof NUTRIENTS)[number];

/** Loom's REST rows send numerics as strings ("125.00"); food-search sends numbers. */
export function num(v: unknown): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

export interface LoomPer100 {
    kcal?: unknown;
    protein_g?: unknown;
    carbs_g?: unknown;
    fat_g?: unknown;
    fiber_g?: unknown;
    sugar_g?: unknown;
    sodium_mg?: unknown;
    caffeine_mg?: unknown;
    alcohol_g?: unknown;
}

export interface LoomFood extends LoomPer100 {
    id: string;
    name: string;
    brand?: string | null;
    store?: string | null;
    source?: string | null;
    grams_per_piece?: unknown;
    ml_to_g?: unknown;
    default_amount?: unknown;
    default_unit?: "g" | "ml" | "piece" | null;
}

export interface LoomRecipeLine {
    position: number;
    name: string;
    quantity?: unknown;
    unit?: string | null;
    grams?: unknown;
    negligible?: boolean | null;
    food_id?: string | null;
    store?: string | null;
    macros_from?: "override" | "food" | "negligible" | null;
    /** figures for the line's own quantity (Loom computes them) */
    kcal?: unknown;
    protein_g?: unknown;
    carbs_g?: unknown;
    fat_g?: unknown;
    fiber_g?: unknown;
    sugar_g?: unknown;
    sodium_mg?: unknown;
    caffeine_mg?: unknown;
    alcohol_g?: unknown;
}

/**
 * The recipe row itself carries its stored per-serving figures (kcal,
 * protein_g…, from the vault import or a past derive); `derived` is what the
 * ingredients add up to right now, null while any line lacks figures.
 */
export interface LoomRecipe extends LoomPer100 {
    id: string;
    slug: string;
    title: string;
    servings?: unknown;
    ingredients: LoomRecipeLine[];
    /** 'ingredients' once a derive has copied the ingredient sums onto the row. */
    macros_source?: string | null;
    serving_note?: string | null;
    derived?: {
        complete?: boolean;
        servings?: unknown;
        per_serving?: LoomPer100;
    } | null;
}

const fromLoom: Record<Nutrient, keyof LoomPer100> = {
    calories: "kcal",
    protein_g: "protein_g",
    carbs_g: "carbs_g",
    fat_g: "fat_g",
    fiber_g: "fiber_g",
    sugar_g: "sugar_g",
    alcohol_g: "alcohol_g",
    caffeine_mg: "caffeine_mg",
    sodium_mg: "sodium_mg",
};

const round = (n: number, places: number) =>
    Math.round(n * 10 ** places) / 10 ** places;

/** Nutrients of `src` multiplied by `factor`; a missing figure stays null. */
function scaled(src: LoomPer100, factor: number) {
    const out: Partial<Record<Nutrient, number | null>> = {};
    for (const key of NUTRIENTS) {
        const v = num(src[fromLoom[key]]);
        out[key] =
            v == null ? null : round(v * factor, key === "calories" ? 1 : 2);
    }
    return out as Record<Nutrient, number | null>;
}

function itemSource(s: string | null | undefined): MealItemSource {
    return s === "label" || s === "barcode" || s === "recipe" ? s : "estimate";
}

export class LoomFoodError extends Error {}

/** Grams for `amount` of a food in g, ml or pieces. */
export function foodGrams(
    food: LoomFood,
    amount: number,
    unit: "g" | "ml" | "piece",
): number {
    if (!(amount > 0)) throw new LoomFoodError("Amount must be above 0.");
    if (unit === "g") return amount;
    if (unit === "ml") {
        const d = num(food.ml_to_g);
        if (d == null)
            throw new LoomFoodError(
                `${food.name} has no density, so ml can't be converted.`,
            );
        return amount * d;
    }
    const g = num(food.grams_per_piece);
    if (g == null)
        throw new LoomFoodError(`${food.name} has no weight per piece.`);
    return amount * g;
}

/**
 * One catalog food as a meal item. Without an amount it uses the food's
 * typical portion (a yogurt pot, one Clif bar).
 */
export function itemForFood(
    food: LoomFood,
    amount?: number | null,
    unit?: "g" | "ml" | "piece" | null,
): MealItem {
    let a = amount ?? null;
    let u = unit ?? null;
    if (a == null) {
        a = num(food.default_amount);
        u = food.default_unit ?? null;
        if (a == null || u == null)
            throw new LoomFoodError(
                `${food.name} has no typical portion; give an amount.`,
            );
    }
    const grams = foodGrams(food, a, u ?? "g");
    const n = scaled(food, grams / 100);
    return {
        name: food.name,
        amount: a,
        unit: u ?? "g",
        calories: n.calories ?? 0,
        protein_g: n.protein_g,
        carbs_g: n.carbs_g,
        fat_g: n.fat_g,
        fiber_g: n.fiber_g,
        sugar_g: n.sugar_g,
        alcohol_g: n.alcohol_g,
        caffeine_mg: n.caffeine_mg,
        sodium_mg: n.sodium_mg,
        source: itemSource(food.source),
        food_id: food.id,
        store: food.store ?? null,
    };
}

/**
 * `servings` of a Loom recipe as one meal item. When every ingredient has
 * figures (Loom's `derived.complete`), the item carries its ingredients as
 * children and its own figures are their sum; otherwise it is a single
 * serving-based line from the recipe's per-serving figures, with no children
 * (a half-measured tree whose parent isn't the sum of its rows would mislead).
 */
export function itemForRecipe(recipe: LoomRecipe, servings: number): MealItem {
    if (!(servings > 0)) throw new LoomFoodError("Servings must be above 0.");
    const batch = num(recipe.derived?.servings) ?? num(recipe.servings);
    const base = {
        name: recipe.title,
        amount: servings,
        unit: "serving",
        source: "recipe" as const,
        recipe_id: recipe.id,
    };
    // What gets logged is the recipe's stored figures when it has any (Loom's
    // rule, loom#3). The ingredient tree is only shown when those ARE the
    // ingredient sums, i.e. a derive has run or nothing is stored, so the
    // parent always equals its rows (berenjenas: stored 330 vs derived 446).
    const storedIsSum =
        recipe.macros_source === "ingredients" || num(recipe.kcal) == null;
    if (recipe.derived?.complete && batch && storedIsSum) {
        const factor = servings / batch;
        const children: MealItem[] = recipe.ingredients
            .filter((line) => !line.negligible)
            .map((line) => {
                const grams = num(line.grams);
                const n = scaled(line, factor);
                return {
                    name: line.name,
                    amount:
                        grams != null
                            ? round(grams * factor, 1)
                            : round((num(line.quantity) ?? 1) * factor, 2),
                    unit: grams != null ? "g" : (line.unit ?? "piece"),
                    calories: n.calories ?? 0,
                    protein_g: n.protein_g,
                    carbs_g: n.carbs_g,
                    fat_g: n.fat_g,
                    fiber_g: n.fiber_g,
                    sugar_g: n.sugar_g,
                    alcohol_g: n.alcohol_g,
                    caffeine_mg: n.caffeine_mg,
                    sodium_mg: n.sodium_mg,
                    source: line.macros_from === "food" ? "recipe" : "estimate",
                    food_id: line.food_id ?? null,
                    store: line.store ?? null,
                };
            });
        const sum = sumOfChildren(children);
        return { ...base, ...sum, calories: sum.calories, children };
    }
    // Not complete: use the recipe row's stored figures, never derived ones.
    // A partly linked recipe derives partial sums (eggs counted, potatoes
    // missing) that look like real figures but undercount.
    const per = recipe;
    if (num(per.kcal) == null)
        throw new LoomFoodError(
            `${recipe.title} has no figures yet, so it can't be logged from Loom.`,
        );
    const n = scaled(per, servings);
    return { ...base, ...n, calories: n.calories ?? 0 };
}

/** Change a recipe's servings: every ingredient scales with it. */
export function setServings(item: MealItem, servings: number): MealItem {
    if (!(servings > 0)) throw new LoomFoodError("Servings must be above 0.");
    const factor = servings / item.amount;
    if (!item.children?.length) return scaleItemBy(item, factor, servings);
    const children = item.children.map((c) =>
        scaleItemBy(c, factor, round(c.amount * factor, 2)),
    );
    const sum = sumOfChildren(children);
    return {
        ...item,
        ...sum,
        calories: sum.calories,
        amount: servings,
        children,
    };
}

/** Change one ingredient's amount: the recipe line becomes the new sum. */
export function setChildAmount(
    item: MealItem,
    index: number,
    amount: number,
): MealItem {
    const children = item.children;
    if (
        !children ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= children.length
    )
        throw new RangeError("Ingredient index is out of range.");
    if (!(amount > 0)) throw new LoomFoodError("Amount must be above 0.");
    const child = children[index]!;
    const next = children.map((c, i) =>
        i === index ? scaleItemBy(c, amount / child.amount, amount) : c,
    );
    const sum = sumOfChildren(next);
    return { ...item, ...sum, calories: sum.calories, children: next };
}
