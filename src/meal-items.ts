export type MealItemSource =
    "label" | "chain" | "barcode" | "estimate" | "recipe";

export interface MealItem {
    name: string;
    amount: number;
    unit: string;
    calories: number;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    fiber_g?: number | null;
    sugar_g?: number | null;
    alcohol_g?: number | null;
    caffeine_mg?: number | null;
    sodium_mg?: number | null;
    source?: MealItemSource | null;
}

export const MAX_MEAL_ITEMS = 20;
const numeric = [
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
const optional = new Set<string>([
    "fiber_g",
    "sugar_g",
    "alcohol_g",
    "caffeine_mg",
    "sodium_mg",
    "protein_g",
    "carbs_g",
    "fat_g",
]);
const sources = new Set(["label", "chain", "barcode", "estimate", "recipe"]);

export function checkMealItems(
    raw: unknown,
    max = MAX_MEAL_ITEMS,
): { ok: true; value: MealItem[] } | { ok: false; error: string } {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > max)
        return {
            ok: false,
            error: `Items must contain 1 to ${max} foods.`,
        };
    const value: MealItem[] = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item || typeof item !== "object" || Array.isArray(item))
            return { ok: false, error: `Item ${i + 1} must be an object.` };
        const obj = item as Record<string, unknown>;
        if (
            typeof obj.name !== "string" ||
            obj.name.trim().length < 1 ||
            obj.name.trim().length > 200
        )
            return {
                ok: false,
                error: `Item ${i + 1} needs a name of 1 to 200 characters.`,
            };
        if (
            typeof obj.unit !== "string" ||
            obj.unit.trim().length < 1 ||
            obj.unit.trim().length > 20
        )
            return {
                ok: false,
                error: `Item ${i + 1} needs a unit of 1 to 20 characters.`,
            };
        const parsed: Record<string, unknown> = {
            name: obj.name.trim(),
            unit: obj.unit.trim(),
        };
        for (const key of ["amount", ...numeric]) {
            const v = obj[key];
            if (v == null && optional.has(key)) {
                parsed[key] = null;
                continue;
            }
            const n =
                typeof v === "number"
                    ? v
                    : typeof v === "string" && v.trim()
                      ? Number(v)
                      : NaN;
            if (
                !Number.isFinite(n) ||
                n < 0 ||
                (key === "amount" && (n <= 0 || n > 100000))
            )
                return {
                    ok: false,
                    error: `Item ${i + 1} has an invalid ${key}.`,
                };
            parsed[key] = n;
        }
        if (
            obj.source != null &&
            (typeof obj.source !== "string" || !sources.has(obj.source))
        )
            return { ok: false, error: `Item ${i + 1} has an invalid source.` };
        if (obj.source !== undefined) parsed.source = obj.source;
        value.push(parsed as unknown as MealItem);
    }
    return { ok: true, value };
}

type Totals = {
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    alcohol_g: number | null;
    caffeine_mg: number | null;
    sodium_mg: number | null;
    source: MealItemSource;
};
export function totalsFromItems(items: MealItem[]): Totals {
    const sum = (
        key: (typeof numeric)[number],
        integer = false,
    ): number | null => {
        const vals = items
            .map((i) => i[key])
            .filter((v): v is number => typeof v === "number");
        if (key !== "calories" && vals.length === 0) return null;
        const n = vals.reduce((a, b) => a + b, 0);
        return integer ? Math.round(n) : Math.round(n * 10) / 10;
    };
    const ss = items.map((i) => i.source);
    const source =
        ss[0] != null && ss.every((s) => s === ss[0]) ? ss[0]! : "estimate";
    return {
        calories: sum("calories", true)!,
        protein_g: sum("protein_g"),
        carbs_g: sum("carbs_g"),
        fat_g: sum("fat_g"),
        fiber_g: sum("fiber_g"),
        sugar_g: sum("sugar_g"),
        alcohol_g: sum("alcohol_g"),
        caffeine_mg: sum("caffeine_mg"),
        sodium_mg: sum("sodium_mg"),
        source,
    };
}

/**
 * An item's nutrients multiplied by `factor` (null stays null). Items are
 * stored in jsonb, so they keep one decimal of kcal and two of everything
 * else: rounding harder turned a 0.04 g ingredient into a stored 0 (a fake
 * measurement) and compounded across repeated edits. The page rounds for
 * display, and meal totals are rounded when summed (totalsFromItems).
 */
export function scaleItemBy(
    item: MealItem,
    factor: number,
    amount: number,
): MealItem {
    const result = { ...item, amount };
    for (const key of numeric) {
        const n = item[key];
        if (n != null)
            result[key] =
                key === "calories"
                    ? Math.round(n * factor * 10) / 10
                    : Math.round(n * factor * 100) / 100;
    }
    return result;
}

export function scaleItem(item: MealItem, newAmount: number): MealItem {
    return scaleItemBy(item, newAmount / item.amount, newAmount);
}

export function itemsForRecipe(
    recipe: {
        name: string;
        servings: number;
        ingredient_items: MealItem[] | null;
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        fiber_g: number | null;
        sugar_g: number | null;
        sodium_mg: number | null;
        caffeine_mg: number | null;
    },
    servings: number,
): MealItem[] {
    const round = (n: number, places: number) =>
        Math.round(n * 10 ** places) / 10 ** places;
    if (recipe.ingredient_items?.length) {
        const factor = servings / recipe.servings;
        return recipe.ingredient_items.map((item) =>
            // The factor comes from the servings, not from the rounded
            // amount: 0.5 tsp / 6 stored as 0.08 would skew it by ~4%.
            scaleItemBy(item, factor, round(item.amount * factor, 2)),
        );
    }
    const scaled = (v: number | null, places: number) =>
        v == null ? null : round(v * servings, places);
    return [
        {
            name: recipe.name,
            amount: servings,
            unit: "serving",
            calories: scaled(recipe.calories, 0) ?? 0,
            protein_g: scaled(recipe.protein_g, 1),
            carbs_g: scaled(recipe.carbs_g, 1),
            fat_g: scaled(recipe.fat_g, 1),
            fiber_g: scaled(recipe.fiber_g, 1),
            sugar_g: scaled(recipe.sugar_g, 1),
            sodium_mg: scaled(recipe.sodium_mg, 0),
            caffeine_mg: scaled(recipe.caffeine_mg, 0),
            source: "recipe",
        },
    ];
}

export function removeItem(items: MealItem[], index: number): MealItem[] {
    if (!Number.isInteger(index) || index < 0 || index >= items.length)
        throw new RangeError("Item index is out of range.");
    return items.filter((_, i) => i !== index);
}

const PLURAL_UNITS = new Set(["can", "cup", "slice", "serving", "bottle"]);

export function describeItems(
    items: MealItem[],
    label?: string | null,
): string {
    const description = items
        .map((item) => {
            const amount = Number.isInteger(item.amount)
                ? String(item.amount)
                : String(item.amount).replace(/\.0+$/, "");
            // A piece is just a count ("Clif Bar (2)"); countable units
            // take a plural ("2 cans"); measures (g, ml, tbsp) never do.
            if (item.unit === "piece") return `${item.name} (${amount})`;
            const unit =
                PLURAL_UNITS.has(item.unit) && item.amount !== 1
                    ? `${item.unit}s`
                    : item.unit;
            return `${item.name} (${amount} ${unit})`;
        })
        .join(" + ");
    return label ? `${label}: ${description}` : description;
}
