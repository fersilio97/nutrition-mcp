/**
 * Read access to Loom's shared food database (loom#2) for the users it is
 * switched on for. Config comes from the server env:
 *
 *   LOOM_URL        e.g. http://127.0.0.1:8092 (local) or https://loom.labucu.com
 *   LOOM_WORKSPACE  the household workspace id
 *   LOOM_TOKEN      a `loom_` token scoped `recipes`
 *   LOOM_USER_IDS   comma-separated nutrition-mcp user ids that use Loom
 *
 * Anyone not listed keeps today's behaviour exactly: no extra tool
 * parameters, no extra description text, no network call.
 */
import {
    LoomFoodError,
    itemForFood,
    itemForRecipe,
    type LoomFood,
    type LoomRecipe,
} from "./loom-food.js";
import type { MealItem } from "./meal-items.js";

export interface LoomConfig {
    url: string;
    workspace: string;
    token: string;
}

export function loomConfigFor(
    userId: string,
    env: Record<string, string | undefined> = process.env,
): LoomConfig | null {
    const users = (env.LOOM_USER_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!users.includes(userId)) return null;
    const { LOOM_URL: url, LOOM_WORKSPACE: workspace, LOOM_TOKEN: token } = env;
    if (!url || !workspace || !token) return null;
    return { url: url.replace(/\/+$/, ""), workspace, token };
}

export interface LoomCandidate {
    kind: "recipe" | "food";
    id: string;
    slug?: string;
    name: string;
    matched?: string;
    score: number;
    servings?: number | null;
    derived_complete?: boolean;
    /** What one serving is, e.g. "2 mitades de berenjena" (asked of loom#2). */
    serving_note?: string | null;
    per_serving?: Record<string, number | null>;
    grams_per_serving?: number | null;
    brand?: string | null;
    store?: string | null;
    per_100g?: Record<string, number | null>;
    default_amount?: number | null;
    default_unit?: string | null;
}

export interface LoomApi {
    search(
        q: string,
        limit?: number,
    ): Promise<{ ambiguous: boolean; candidates: LoomCandidate[] }>;
    recipe(slug: string): Promise<LoomRecipe | null>;
    food(id: string): Promise<LoomFood | null>;
}

export class LoomUnavailableError extends Error {}

export function loomApi(
    cfg: LoomConfig,
    fetchImpl: typeof fetch = fetch,
): LoomApi {
    const get = async (path: string) => {
        let res: Response;
        try {
            res = await fetchImpl(
                `${cfg.url}/v1/workspaces/${cfg.workspace}${path}`,
                {
                    headers: { Authorization: `Bearer ${cfg.token}` },
                    signal: AbortSignal.timeout(5000),
                },
            );
        } catch (e) {
            throw new LoomUnavailableError(
                `Loom is unreachable (${(e as Error).message}).`,
            );
        }
        if (res.status === 404) return null;
        if (!res.ok)
            throw new LoomUnavailableError(`Loom answered ${res.status}.`);
        return res.json() as Promise<Record<string, unknown>>;
    };
    return {
        async search(q, limit = 8) {
            const body = await get(
                `/food-search?q=${encodeURIComponent(q)}&limit=${limit}`,
            );
            return {
                ambiguous: Boolean(body?.ambiguous),
                candidates: (body?.candidates as LoomCandidate[]) ?? [],
            };
        },
        async recipe(slug) {
            const body = await get(`/recipes/${encodeURIComponent(slug)}`);
            return body
                ? ((body.recipe ?? body) as unknown as LoomRecipe)
                : null;
        },
        async food(id) {
            const body = await get(`/foods/${encodeURIComponent(id)}`);
            return body ? ((body.food ?? body) as unknown as LoomFood) : null;
        },
    };
}

/** One `loom_items` entry from log_meal. */
export interface LoomItemRef {
    recipe?: string;
    servings?: number;
    food?: string;
    amount?: number;
    unit?: "g" | "ml" | "piece";
}

/**
 * Turn log_meal's `loom_items` into meal items, adding up the figures here
 * rather than trusting the model's arithmetic. Every failure names the entry
 * so the model can fix it or fall back to estimating that one food.
 */
export async function resolveLoomItems(
    api: LoomApi,
    refs: LoomItemRef[],
): Promise<{ ok: true; items: MealItem[] } | { ok: false; error: string }> {
    const items: MealItem[] = [];
    for (const [i, ref] of refs.entries()) {
        const label = `loom_items[${i}]`;
        if ((ref.recipe ? 1 : 0) + (ref.food ? 1 : 0) !== 1)
            return {
                ok: false,
                error: `${label}: give exactly one of recipe (a slug) or food (an id).`,
            };
        try {
            if (ref.recipe) {
                const recipe = await api.recipe(ref.recipe);
                if (!recipe)
                    return {
                        ok: false,
                        error: `${label}: no Loom recipe "${ref.recipe}". Use manage_recipes action 'find' for the slug.`,
                    };
                items.push(itemForRecipe(recipe, ref.servings ?? 1));
            } else {
                const food = await api.food(ref.food!);
                if (!food)
                    return {
                        ok: false,
                        error: `${label}: no Loom food "${ref.food}". Use manage_recipes action 'find' for the id.`,
                    };
                items.push(itemForFood(food, ref.amount, ref.unit));
            }
        } catch (e) {
            if (e instanceof LoomFoodError || e instanceof LoomUnavailableError)
                return { ok: false, error: `${label}: ${e.message}` };
            throw e;
        }
    }
    return { ok: true, items };
}

const fmt = (n: number | null | undefined, unit = "") =>
    n == null ? "?" : `${Math.round(n * 10) / 10}${unit}`;

/** manage_recipes action 'find': model-facing text for Loom's candidates. */
export function formatCandidates(
    q: string,
    result: { ambiguous: boolean; candidates: LoomCandidate[] },
): string {
    if (!result.candidates.length)
        return `Nothing in Loom matches "${q}". Estimate it and log it with items as usual.`;
    const lines = result.candidates.map((c) => {
        if (c.kind === "recipe") {
            const p = c.per_serving ?? {};
            const figures =
                p.kcal == null
                    ? "no figures yet: estimate it instead"
                    : `${fmt(p.kcal)} kcal, P${fmt(p.protein_g)} C${fmt(p.carbs_g)} F${fmt(p.fat_g)} per serving`;
            // Replay case c14: "dos medias berenjenas" was 1 serving, logged
            // as 2, because nothing said what a serving is.
            const grams =
                c.grams_per_serving != null
                    ? ` (about ${Math.round(c.grams_per_serving)} g)`
                    : "";
            const serving = c.serving_note
                ? `; 1 serving = ${c.serving_note}${grams}`
                : grams
                  ? `; 1 serving is${grams}`
                  : "; what one serving is isn't recorded: if the user names pieces (halves, slices), ask how they map to servings";
            return `- recipe "${c.name}" slug=${c.slug} (makes ${c.servings ?? "?"} servings${serving}; ${figures}; match ${c.score})`;
        }
        const p = c.per_100g ?? {};
        const where = [c.brand, c.store].filter(Boolean).join(", ");
        const portion =
            c.default_amount != null
                ? `; typical portion ${c.default_amount} ${c.default_unit}`
                : "";
        return `- food "${c.name}"${where ? ` (${where})` : ""} id=${c.id} (${fmt(p.kcal)} kcal per 100 g${portion}; match ${c.score})`;
    });
    // A partial match is only a lead: "yogur" scores 0.73 against a chicken
    // dish "…con salsa de yogur" by word similarity alone.
    const exact = result.candidates[0]!.score >= 1;
    const head = result.ambiguous
        ? `Several Loom entries match "${q}". Ask the user which one they had before logging; don't pick one yourself.`
        : exact
          ? `Loom matches for "${q}" (best first; the first is an exact match):`
          : `No exact Loom match for "${q}"; these only share words with it. Use one only if the user confirms it's the same dish or food; otherwise estimate it and log it with items.`;
    return `${head}\n${lines.join("\n")}\nLog with log_meal loom_items: {recipe: slug, servings} or {food: id, amount, unit}. A recipe without figures can't be logged from Loom.`;
}
