export type MealItemSource =
    "label" | "chain" | "barcode" | "estimate" | "recipe";

export interface MealItem {
    name: string;
    amount: number;
    unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
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
]);
const sources = new Set(["label", "chain", "barcode", "estimate", "recipe"]);

export function checkMealItems(
    raw: unknown,
): { ok: true; value: MealItem[] } | { ok: false; error: string } {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_MEAL_ITEMS)
        return {
            ok: false,
            error: `Items must contain 2 to ${MAX_MEAL_ITEMS} foods.`,
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
    protein_g: number;
    carbs_g: number;
    fat_g: number;
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
        if (optional.has(key) && vals.length === 0) return null;
        const n = vals.reduce((a, b) => a + b, 0);
        return integer ? Math.round(n) : Math.round(n * 10) / 10;
    };
    const ss = items.map((i) => i.source);
    const source =
        ss[0] != null && ss.every((s) => s === ss[0]) ? ss[0]! : "estimate";
    return {
        calories: sum("calories", true)!,
        protein_g: sum("protein_g")!,
        carbs_g: sum("carbs_g")!,
        fat_g: sum("fat_g")!,
        fiber_g: sum("fiber_g"),
        sugar_g: sum("sugar_g"),
        alcohol_g: sum("alcohol_g"),
        caffeine_mg: sum("caffeine_mg"),
        sodium_mg: sum("sodium_mg"),
        source,
    };
}

export function scaleItem(item: MealItem, newAmount: number): MealItem {
    const factor = newAmount / item.amount;
    const result = { ...item, amount: newAmount };
    for (const key of numeric) {
        const n = item[key];
        if (n != null)
            result[key] =
                key === "calories"
                    ? Math.round(n * factor)
                    : Math.round(n * factor * 10) / 10;
    }
    return result;
}

export function removeItem(items: MealItem[], index: number): MealItem[] {
    if (!Number.isInteger(index) || index < 0 || index >= items.length)
        throw new RangeError("Item index is out of range.");
    return items.filter((_, i) => i !== index);
}

export function describeItems(items: MealItem[]): string {
    return items
        .map((item) => {
            const amount = Number.isInteger(item.amount)
                ? String(item.amount)
                : String(item.amount).replace(/\.0+$/, "");
            return `${item.name} (${amount}${item.unit === "piece" ? "" : ` ${item.unit}`})`;
        })
        .join(" + ");
}
