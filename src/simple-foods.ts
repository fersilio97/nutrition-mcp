// A small catalogue of simple, standard items — a black coffee, a beer, a
// glass of wine — so the dashboard's "Log a meal" form can fill their
// nutrients without an LLM. Deliberately tiny: only things whose composition
// is the same wherever you get them. A dish, a restaurant meal or a branded
// product does NOT belong here (those need a label, a menu, or an estimate).
//
// Figures are typical USDA-style values for the named serving, shown to the
// user as "typical values — adjust if yours differs", never saved silently:
// the page fills the form and the user presses Log.
//
// Matching is by WHOLE-DESCRIPTION equality after normalisation, not
// substring: "coffee" is a black coffee, "coffee ice cream" is not. A leading
// count multiplies ("2 beers").
//
// Fiber and sugar are always set (0 where true) — an omitted value reads as
// "nobody measured this" and drops the day out of the averages. Caffeine is
// set only for real caffeine sources: an explicit 0 would switch the caffeine
// row on for someone who never drinks any.

export interface FoodValues {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    alcohol_g?: number;
    caffeine_mg?: number;
}

interface FoodEntry extends FoodValues {
    id: string;
    name: string;
    aliases: string[];
}

export interface Serving {
    label: string;
    /** In the entry's unit (ml, or a count of eggs / tbsp / ...). */
    amount: number;
}

export interface FoodMatch {
    id: string;
    /** Generic name: "Beer". The amount is separate. */
    name: string;
    unit: string;
    servings: Serving[];
    /** The amount in `unit` the values are for (one portion). */
    amount: number;
    /** How many of that amount. */
    count: number;
    /** Nutrients for count × amount. */
    values: FoodValues;
    /** Fit to write into a meal description, portion included:
     *  "2 × Beer (Pint 473 ml)". */
    description: string;
}

const FOODS: FoodEntry[] = [
    {
        id: "coffee-black",
        name: "Black coffee",
        aliases: [
            "coffee",
            "black coffee",
            "coffee black",
            "coffee solo",
            "filter coffee",
            "drip coffee",
            "cafe",
            "cafe solo",
            "cafe negro",
        ],
        calories: 2,
        protein_g: 0.3,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        caffeine_mg: 95,
    },
    {
        id: "espresso",
        name: "Espresso",
        aliases: ["espresso", "expreso", "cafe espresso", "shot of espresso"],
        calories: 1,
        protein_g: 0.1,
        carbs_g: 0.2,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        caffeine_mg: 63,
    },
    {
        id: "coffee-milk",
        name: "Coffee with milk",
        aliases: [
            "coffee with milk",
            "milk coffee",
            "white coffee",
            "cafe con leche",
        ],
        calories: 33,
        protein_g: 1.9,
        carbs_g: 2.4,
        fat_g: 1.7,
        fiber_g: 0,
        sugar_g: 2.4,
        caffeine_mg: 95,
    },
    {
        id: "tea-black",
        name: "Black tea",
        aliases: ["tea", "black tea", "te", "te negro"],
        calories: 2,
        protein_g: 0,
        carbs_g: 0.7,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        caffeine_mg: 47,
    },
    {
        id: "tea-green",
        name: "Green tea",
        aliases: ["green tea", "te verde"],
        calories: 2,
        protein_g: 0.5,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        caffeine_mg: 29,
    },
    {
        id: "beer",
        name: "Beer",
        aliases: ["beer", "cerveza", "lager", "pilsner"],
        calories: 153,
        protein_g: 1.6,
        carbs_g: 12.6,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        alcohol_g: 13.9,
    },
    {
        id: "beer-light",
        name: "Light beer",
        aliases: ["light beer", "cerveza light", "cerveza sin", "lite beer"],
        calories: 103,
        protein_g: 0.9,
        carbs_g: 5.8,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        alcohol_g: 11,
    },
    {
        id: "wine-red",
        name: "Red wine",
        aliases: ["wine", "red wine", "vino", "vino tinto"],
        calories: 125,
        protein_g: 0.1,
        carbs_g: 3.8,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0.9,
        alcohol_g: 15.6,
    },
    {
        id: "wine-white",
        name: "White wine",
        aliases: ["white wine", "vino blanco", "rose wine", "vino rosado"],
        calories: 121,
        protein_g: 0.1,
        carbs_g: 3.8,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 1,
        alcohol_g: 14.2,
    },
    {
        id: "sparkling-wine",
        name: "Cava / champagne",
        aliases: ["cava", "champagne", "champan", "sparkling wine", "prosecco"],
        calories: 90,
        protein_g: 0.2,
        carbs_g: 1.5,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 1.2,
        alcohol_g: 11.5,
    },
    {
        id: "spirit",
        name: "Spirit (40%)",
        aliases: [
            "vodka",
            "gin",
            "whisky",
            "whiskey",
            "rum",
            "ron",
            "tequila",
            "brandy",
            "shot",
        ],
        calories: 97,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        alcohol_g: 14,
    },
    {
        id: "cola",
        name: "Cola",
        aliases: ["cola", "coke", "coca cola"],
        calories: 140,
        protein_g: 0,
        carbs_g: 39,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 39,
        caffeine_mg: 34,
    },
    {
        id: "cola-zero",
        name: "Diet / zero cola",
        aliases: [
            "diet coke",
            "diet cola",
            "coke zero",
            "cola zero",
            "coca cola zero",
            "coca cola light",
        ],
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        caffeine_mg: 40,
    },
    {
        id: "orange-juice",
        name: "Orange juice",
        aliases: ["orange juice", "zumo de naranja", "jugo de naranja", "zumo"],
        calories: 112,
        protein_g: 1.7,
        carbs_g: 25.8,
        fat_g: 0.5,
        fiber_g: 0.5,
        sugar_g: 20.8,
    },
    {
        id: "milk-whole",
        name: "Whole milk",
        aliases: ["milk", "whole milk", "leche", "leche entera"],
        calories: 149,
        protein_g: 7.7,
        carbs_g: 11.7,
        fat_g: 7.9,
        fiber_g: 0,
        sugar_g: 12.3,
    },
    {
        id: "egg-boiled",
        name: "Boiled egg",
        aliases: ["boiled egg", "hard boiled egg", "huevo cocido"],
        calories: 78,
        protein_g: 6.3,
        carbs_g: 0.6,
        fat_g: 5.3,
        fiber_g: 0,
        sugar_g: 0.6,
    },
    {
        id: "banana",
        name: "Banana",
        aliases: ["banana", "platano"],
        calories: 105,
        protein_g: 1.3,
        carbs_g: 27,
        fat_g: 0.4,
        fiber_g: 3.1,
        sugar_g: 14.4,
    },
    {
        id: "apple",
        name: "Apple",
        aliases: ["apple", "manzana"],
        calories: 95,
        protein_g: 0.5,
        carbs_g: 25.1,
        fat_g: 0.3,
        fiber_g: 4.4,
        sugar_g: 18.9,
    },
    {
        id: "olive-oil",
        name: "Olive oil",
        aliases: ["olive oil", "aceite de oliva", "aceite"],
        calories: 119,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 13.5,
        fiber_g: 0,
        sugar_g: 0,
    },
];

// Words that carry no nutritional meaning in "a glass of wine" / "una copa
// de vino" / "1 mug coffee".
const FILLER = new Set([
    "a",
    "an",
    "the",
    "of",
    "de",
    "un",
    "una",
    "cup",
    "mug",
    "glass",
    "taza",
    "vaso",
    "copa",
    "can",
    "lata",
]);
const COUNT_WORDS: Record<string, number> = {
    one: 1,
    uno: 1,
    un: 1,
    una: 1,
    two: 2,
    dos: 2,
    three: 3,
    tres: 3,
    four: 4,
    cuatro: 4,
};
const MAX_COUNT = 12;

function normalise(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// "2 beers", "dos cervezas", "2 wines": a second chance with the plural
// ending dropped, so an alias that really ends in "s" still matches as typed.
function stems(w: string): string[] {
    const out = [w];
    if (w.endsWith("s") && w.length > 3) out.push(w.slice(0, -1));
    if (w.endsWith("es") && w.length > 4) out.push(w.slice(0, -2));
    return out;
}

/** Normalised words with filler dropped — the form both aliases and the
 *  user's description are compared in. */
function keyWords(s: string): string[] {
    return normalise(s)
        .split(" ")
        .filter((w) => w && !FILLER.has(w));
}

const INDEX: Map<string, FoodEntry> = new Map();
for (const f of FOODS)
    for (const alias of f.aliases) {
        const k = keyWords(alias).join(" ");
        if (INDEX.has(k) && INDEX.get(k) !== f)
            throw new Error(`simple-foods.ts: alias "${alias}" is used twice`);
        INDEX.set(k, f);
    }

// How much of each item the values above are FOR (`ref`), the amounts it
// is commonly had in, and which one is the default. The entry's figures are
// for exactly one `ref`; any other amount scales linearly.
interface Portion {
    unit: string;
    ref: number;
    servings: Serving[];
    def: number;
}
const sv = (label: string, amount: number): Serving => ({ label, amount });
const BEER = [
    sv("Caña 200 ml", 200),
    sv("Small bottle 250 ml", 250),
    sv("Bottle 330 ml", 330),
    sv("Can 355 ml", 355),
    sv("Pint 473 ml", 473),
    sv("Half litre 500 ml", 500),
    sv("Litre 1000 ml", 1000),
];
const WINE = [
    sv("Taster 90 ml", 90),
    sv("Small glass 125 ml", 125),
    sv("Glass 150 ml", 150),
    sv("Large glass 175 ml", 175),
    sv("Half bottle 375 ml", 375),
    sv("Bottle 750 ml", 750),
];
const COLA = [
    sv("Small 250 ml", 250),
    sv("Can 355 ml", 355),
    sv("Bottle 500 ml", 500),
    sv("Litre 1000 ml", 1000),
];
const HOT = [sv("Cup 240 ml", 240), sv("Mug 350 ml", 350)];
const PORTIONS: Record<string, Portion> = {
    "coffee-black": {
        unit: "ml",
        ref: 240,
        servings: [sv("Small cup 150 ml", 150), ...HOT],
        def: 1,
    },
    espresso: {
        unit: "ml",
        ref: 30,
        servings: [sv("Single shot 30 ml", 30), sv("Double shot 60 ml", 60)],
        def: 0,
    },
    "coffee-milk": {
        unit: "cup",
        ref: 1,
        servings: [
            sv("Half cup", 0.5),
            sv("1 cup", 1),
            sv("Large mug (1½ cups)", 1.5),
        ],
        def: 1,
    },
    "tea-black": { unit: "ml", ref: 240, servings: HOT, def: 0 },
    "tea-green": { unit: "ml", ref: 240, servings: HOT, def: 0 },
    beer: { unit: "ml", ref: 355, servings: BEER, def: 3 },
    "beer-light": { unit: "ml", ref: 355, servings: BEER, def: 3 },
    "wine-red": { unit: "ml", ref: 150, servings: WINE, def: 2 },
    "wine-white": { unit: "ml", ref: 150, servings: WINE, def: 2 },
    "sparkling-wine": {
        unit: "ml",
        ref: 125,
        servings: [
            sv("Flute 125 ml", 125),
            sv("Glass 150 ml", 150),
            sv("Half bottle 375 ml", 375),
            sv("Bottle 750 ml", 750),
        ],
        def: 0,
    },
    spirit: {
        unit: "ml",
        ref: 44,
        servings: [
            sv("Small 25 ml", 25),
            sv("Shot 44 ml", 44),
            sv("Large 60 ml", 60),
            sv("Double 88 ml", 88),
        ],
        def: 1,
    },
    cola: { unit: "ml", ref: 355, servings: COLA, def: 1 },
    "cola-zero": { unit: "ml", ref: 355, servings: COLA, def: 1 },
    "orange-juice": {
        unit: "ml",
        ref: 240,
        servings: [
            sv("Small 150 ml", 150),
            sv("Glass 240 ml", 240),
            sv("Large 330 ml", 330),
        ],
        def: 1,
    },
    "milk-whole": {
        unit: "ml",
        ref: 240,
        servings: [
            sv("Small glass 150 ml", 150),
            sv("Glass 240 ml", 240),
            sv("Mug 350 ml", 350),
        ],
        def: 1,
    },
    "egg-boiled": { unit: "egg", ref: 1, servings: [sv("1 egg", 1)], def: 0 },
    banana: {
        unit: "banana",
        ref: 1,
        servings: [sv("Half", 0.5), sv("1 medium", 1)],
        def: 1,
    },
    apple: {
        unit: "apple",
        ref: 1,
        servings: [sv("Half", 0.5), sv("1 medium", 1)],
        def: 1,
    },
    "olive-oil": {
        unit: "tbsp",
        ref: 1,
        servings: [sv("1 tsp", 0.33), sv("1 tbsp", 1), sv("2 tbsp", 2)],
        def: 1,
    },
};
const BY_ID = new Map(FOODS.map((f) => [f.id, f]));
for (const f of FOODS) {
    const q = PORTIONS[f.id];
    if (!q || !q.servings[q.def])
        throw new Error(`simple-foods.ts: no portions for "${f.id}"`);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const MAX_ML = 5000;
const MAX_PIECES = 20;

/** Nutrients for `count` × `amount` of an item (amount in the item's unit;
 *  the default serving when omitted). Null for an unknown item or an amount
 *  / count out of range. Pure. */
export function foodMatchFor(
    id: string,
    amount?: number,
    count = 1,
): FoodMatch | null {
    const entry = BY_ID.get(id);
    const por = PORTIONS[id];
    if (!entry || !por) return null;
    const amt = amount ?? por.servings[por.def]!.amount;
    if (
        !Number.isFinite(amt) ||
        amt <= 0 ||
        amt > (por.unit === "ml" ? MAX_ML : MAX_PIECES)
    )
        return null;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;

    const f = (amt / por.ref) * count;
    const scale = (n: number) => round1(n * f);
    const values: FoodValues = {
        calories: Math.round(entry.calories * f),
        protein_g: scale(entry.protein_g),
        carbs_g: scale(entry.carbs_g),
        fat_g: scale(entry.fat_g),
        fiber_g: scale(entry.fiber_g),
        sugar_g: scale(entry.sugar_g),
    };
    if (entry.alcohol_g !== undefined)
        values.alcohol_g = scale(entry.alcohol_g);
    if (entry.caffeine_mg !== undefined)
        values.caffeine_mg = Math.round(entry.caffeine_mg * f);
    const label =
        por.servings.find((x) => Math.abs(x.amount - amt) < 1e-9)?.label ??
        `${round1(amt)} ${por.unit}`;
    return {
        id,
        name: entry.name,
        unit: por.unit,
        servings: por.servings,
        amount: amt,
        count,
        values,
        description: `${count > 1 ? `${count} × ` : ""}${entry.name} (${label})`,
    };
}

/** What the page's item picker lists. */
export function listFoods(): {
    id: string;
    name: string;
    unit: string;
    servings: Serving[];
    amount: number;
}[] {
    return FOODS.map((f) => {
        const por = PORTIONS[f.id]!;
        return {
            id: f.id,
            name: f.name,
            unit: por.unit,
            servings: por.servings,
            amount: por.servings[por.def]!.amount,
        };
    });
}

/** The catalogue entry a description names exactly (after dropping a leading
 *  count and filler words), at its default amount × the count; null when it
 *  names anything else. Pure. */
export function matchFood(description: string): FoodMatch | null {
    const words = normalise(description).split(" ").filter(Boolean);
    if (!words.length) return null;

    let count = 1;
    const first = words[0]!;
    if (/^\d{1,2}$/.test(first)) {
        count = Number(first);
        words.shift();
        if (words[0] === "x") words.shift();
    } else if (first in COUNT_WORDS && words.length > 1) {
        count = COUNT_WORDS[first]!;
        words.shift();
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;

    const rest = words.filter((w) => !FILLER.has(w));
    if (!rest.length) return null;
    const head = rest.slice(0, -1).join(" ");
    let entry: FoodEntry | undefined;
    for (const w of stems(rest.at(-1)!)) {
        entry = INDEX.get(head ? `${head} ${w}` : w);
        if (entry) break;
    }
    return entry ? foodMatchFor(entry.id, undefined, count) : null;
}

/** One entry point for the page's lookups: an item picked by id (with an
 *  optional amount and count), or free text. Query-string values. */
export function suggestFood(p: {
    q?: string | null;
    id?: string | null;
    amount?: string | null;
    count?: string | null;
}): FoodMatch | null {
    const num = (v?: string | null) =>
        v == null || v === "" ? undefined : Number(v);
    if (p.id) return foodMatchFor(p.id, num(p.amount), num(p.count) ?? 1);
    return matchFood(p.q ?? "");
}

/** For tests: every alias, so a collision or an empty entry is caught. */
export const FOOD_ENTRIES: readonly Readonly<FoodEntry>[] = FOODS;
