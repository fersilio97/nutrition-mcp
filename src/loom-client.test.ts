import { describe, expect, test } from "bun:test";
import {
    formatCandidates,
    loomApi,
    loomConfigFor,
    resolveLoomItems,
    type LoomApi,
} from "./loom-client.js";
import type { LoomFood, LoomRecipe } from "./loom-food.js";

const env = {
    LOOM_URL: "http://loom.test/",
    LOOM_WORKSPACE: "ws1",
    LOOM_TOKEN: "loom_x",
    LOOM_USER_IDS: "u-fer, u-other",
};

describe("loomConfigFor", () => {
    test("only listed users get Loom, and only with full config", () => {
        expect(loomConfigFor("u-fer", env)).toEqual({
            url: "http://loom.test",
            workspace: "ws1",
            token: "loom_x",
        });
        expect(loomConfigFor("u-other", env)).not.toBeNull();
        expect(loomConfigFor("u-stranger", env)).toBeNull();
        expect(loomConfigFor("u-fer", { ...env, LOOM_TOKEN: "" })).toBeNull();
        expect(loomConfigFor("u-fer", {})).toBeNull();
    });
});

const recipe: LoomRecipe = {
    id: "r1",
    slug: "pollo-al-chilindron",
    title: "Pollo al chilindrón",
    servings: "6.00",
    kcal: "440.0",
    protein_g: "46.0",
    carbs_g: "12.0",
    fat_g: "22.0",
    ingredients: [],
    derived: { complete: false },
};
const yogur: LoomFood = {
    id: "f1",
    name: "Yogur griego natural",
    store: "Costco",
    source: "label",
    kcal: "59",
    protein_g: "10.2",
    default_amount: "125",
    default_unit: "g",
};
const fake: LoomApi = {
    search: async () => ({ ambiguous: false, candidates: [] }),
    recipe: async (slug) => (slug === recipe.slug ? recipe : null),
    food: async (id) => (id === yogur.id ? yogur : null),
};

describe("resolveLoomItems", () => {
    test("a recipe and a food become items with server-side figures", async () => {
        const r = await resolveLoomItems(fake, [
            { recipe: "pollo-al-chilindron", servings: 2 },
            { food: "f1" },
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(
            r.items.map((i) => [i.name, i.amount, i.unit, i.calories]),
        ).toEqual([
            ["Pollo al chilindrón", 2, "serving", 880],
            ["Yogur griego natural", 125, "g", 73.8],
        ]);
        expect(r.items[1]!.store).toBe("Costco");
    });

    test("each failure names the entry so the model can fix just that one", async () => {
        expect(await resolveLoomItems(fake, [{ recipe: "nope" }])).toEqual({
            ok: false,
            error: expect.stringContaining(
                'loom_items[0]: no Loom recipe "nope"',
            ),
        });
        expect(
            await resolveLoomItems(fake, [
                { food: "f1" },
                { recipe: "x", food: "y" },
            ]),
        ).toEqual({
            ok: false,
            error: expect.stringContaining("loom_items[1]: give exactly one"),
        });
        const noFigures = {
            ...fake,
            recipe: async () => ({ ...recipe, kcal: null }),
        };
        expect(await resolveLoomItems(noFigures, [{ recipe: "a" }])).toEqual({
            ok: false,
            error: expect.stringContaining("has no figures yet"),
        });
    });
});

describe("loomApi", () => {
    test("sends the token, maps 404 to null and an unreachable Loom to a clear error", async () => {
        const seen: string[] = [];
        const api = loomApi(
            { url: "http://loom.test", workspace: "ws1", token: "loom_x" },
            (async (url: string, init?: RequestInit) => {
                seen.push(
                    `${url} ${(init?.headers as Record<string, string>).Authorization}`,
                );
                if (url.includes("/recipes/missing"))
                    return new Response("{}", { status: 404 });
                return Response.json({
                    ambiguous: true,
                    candidates: [
                        { kind: "recipe", id: "r1", name: "A", score: 1 },
                    ],
                });
            }) as typeof fetch,
        );
        expect(await api.recipe("missing")).toBeNull();
        expect((await api.search("tortilla de patata")).ambiguous).toBe(true);
        expect(seen[1]).toBe(
            "http://loom.test/v1/workspaces/ws1/food-search?q=tortilla%20de%20patata&limit=8 Bearer loom_x",
        );
        const down = loomApi(
            { url: "http://loom.test", workspace: "ws1", token: "t" },
            (async () => {
                throw new Error("ECONNREFUSED");
            }) as unknown as typeof fetch,
        );
        await expect(down.food("f1")).rejects.toThrow(/Loom is unreachable/);
    });
});

describe("formatCandidates", () => {
    test("an ambiguous search tells the model to ask, never to pick", () => {
        const text = formatCandidates("tortilla de patata", {
            ambiguous: true,
            candidates: [
                {
                    kind: "recipe",
                    id: "r1",
                    slug: "tortilla-a",
                    name: "Tortilla A",
                    score: 0.82,
                    servings: 2,
                    per_serving: {
                        kcal: 525,
                        protein_g: 30,
                        carbs_g: 30,
                        fat_g: 28,
                    },
                },
                {
                    kind: "recipe",
                    id: "r2",
                    slug: "tortilla-b",
                    name: "Tortilla B",
                    score: 0.8,
                    servings: null,
                    per_serving: { kcal: null },
                },
            ],
        });
        expect(text).toContain("Ask the user which one");
        expect(text).toContain("slug=tortilla-a");
        expect(text).toContain("no figures yet: estimate it instead");
    });

    test("a food shows its store and typical portion; no match says to estimate", () => {
        const text = formatCandidates("yogur", {
            ambiguous: false,
            candidates: [
                {
                    kind: "food",
                    id: "f1",
                    name: "Yogur griego natural",
                    brand: "Kirkland",
                    store: "Costco",
                    score: 1,
                    per_100g: { kcal: 59 },
                    default_amount: 125,
                    default_unit: "g",
                },
            ],
        });
        expect(text).toContain(
            'food "Yogur griego natural" (Kirkland, Costco) id=f1',
        );
        expect(text).toContain("typical portion 125 g");
        expect(
            formatCandidates("pizza", { ambiguous: false, candidates: [] }),
        ).toContain("Nothing in Loom matches");
    });
});
