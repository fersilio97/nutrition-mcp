// Dev-only preview of the personal dashboard against synthetic data.
//
//   bun run dashboard:preview      # then open http://localhost:8791/dashboard
//
// Serves public/dashboard.html (read fresh on every request, so edit and
// refresh) with the production CSP, and answers /api/dashboard/* from the
// seeded fixture in src/dashboard-fixture.ts through the real
// buildDashboardPayload. Sign in with any email and password.
//
// Query parameters on the PAGE url pick what the API serves next. A page load
// that carries any of them resets the others to their defaults and forgets
// any Body form saves; a load with none keeps the current state (single-user
// dev tool, held in memory):
//
//   ?scenario=full|over-goal|no-body|no-goals|empty|lb|calibrate|offset
//   ?delay=2000        delay every data response (shows the skeletons)
//   ?fail=500|401      fail every data response
//
// Writes (Body form, "Log weight", meal edits, calibration skips) run the production validators
// and are kept in memory per scenario; a page load with params forgets them.
//
// Login error states: email 429@test → 429, bad@test → 401.
//
// Never mounted by src/index.ts, and it never touches Supabase: the env vars
// are blanked below, so an accidental call throws instead of reading real data
// (Bun auto-loads .env, so leaving them unexported would not be enough).

process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";

import {
    bodyOf,
    checkMealPatch,
    checkWeightEntry,
    checkCalorieGoal,
    DASHBOARD_CSP,
    dashboardFontResponse,
    parseModelParams,
    whatIf,
} from "../src/dashboard.js";
import {
    SCENARIOS,
    isScenario,
    previewInputsFor,
    previewPayload,
    scenarioTz,
    scenarioWithEdits,
    buildScenario,
    type PreviewEdits,
    type ScenarioName,
} from "../src/dashboard-fixture.js";
import { checkBodyPatch } from "../src/body.js";
import { dateInTz, todayInTz } from "../src/tz.js";
import type { Meal } from "../src/supabase.js";

// The same CSP production sends for /dashboard (src/dashboard-fixture.test.ts
// keeps the two in step), so a CSP violation shows up here before prod.
export const PREVIEW_CSP = DASHBOARD_CSP;

const PORT = Number(process.env.DASHBOARD_PREVIEW_PORT ?? 8791);
const TOKEN = "preview-token";

const state: {
    scenario: ScenarioName;
    delay: number;
    fail: 0 | 401 | 500;
    // Body saves, logged weigh-ins and meal edits, per scenario, in memory.
    edits: Partial<Record<ScenarioName, PreviewEdits>>;
} = { scenario: "full", delay: 0, fail: 0, edits: {} };
let seq = 0;
const edits = (): PreviewEdits => (state.edits[state.scenario] ??= {});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
const invalid = (error_description: string) =>
    json({ error: "invalid_request", error_description }, 400);

function pageHeaders(): HeadersInit {
    return {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": PREVIEW_CSP,
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    };
}

function applyQuery(url: URL) {
    const q = url.searchParams;
    if (!q.has("scenario") && !q.has("delay") && !q.has("fail")) return;
    const s = q.get("scenario") ?? "full";
    state.scenario = isScenario(s) ? s : "full";
    const delay = Number(q.get("delay") ?? 0);
    state.delay = Number.isFinite(delay)
        ? Math.min(30_000, Math.max(0, delay))
        : 0;
    const fail = q.get("fail");
    state.fail = fail === "401" ? 401 : fail === "500" ? 500 : 0;
    // In-memory writes are forgotten too, so ?scenario=no-body always shows
    // the missing-details state it advertises.
    state.edits = {};
    console.log(
        `[preview] scenario=${state.scenario} delay=${state.delay} fail=${state.fail || "none"}`,
    );
}

const authed = (req: Request) =>
    req.headers.get("Authorization") === `Bearer ${TOKEN}`;

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
    try {
        const b = await req.json();
        return b && typeof b === "object" && !Array.isArray(b)
            ? (b as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        if (req.method === "GET" && (path === "/" || path === "/dashboard")) {
            applyQuery(url);
            const html = await Bun.file(
                new URL("../public/dashboard.html", import.meta.url),
            ).text();
            return new Response(html, { headers: pageHeaders() });
        }

        if (req.method === "GET" && path === "/favicon.ico")
            return new Response(
                Bun.file(new URL("../public/favicon.ico", import.meta.url)),
            );

        if (req.method === "POST" && path === "/api/dashboard/login") {
            const b = await readJson(req);
            const email =
                typeof b?.email === "string"
                    ? b.email.trim().toLowerCase()
                    : "";
            const password = typeof b?.password === "string" ? b.password : "";
            if (!email || !password)
                return json({ error: "invalid_request" }, 400);
            if (email === "429@test")
                return json(
                    {
                        error: "rate_limited",
                        error_description:
                            "Rate limit exceeded (10 requests per minute). Retry after 60s.",
                    },
                    429,
                );
            if (email === "bad@test")
                return json({ error: "invalid_credentials" }, 401);
            return json({ access_token: TOKEN });
        }

        if (req.method === "GET" && path === "/api/dashboard/whatif") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const params = parseModelParams(
                Object.fromEntries(url.searchParams),
            );
            if (!params) return json({ error: "invalid_request" }, 400);
            return json(
                whatIf(previewInputsFor(state.scenario, 30, edits()), params),
            );
        }

        if (req.method === "GET" && path === "/api/dashboard/data") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            if (state.delay) await Bun.sleep(state.delay);
            if (state.fail === 401)
                return json({ error: "invalid_token" }, 401);
            if (state.fail === 500) return json({ error: "server_error" }, 500);
            // Visible dashboard ranges are 7 / 30 / 365; leave this endpoint
            // permissive for fixture and API tests.
            const n = Number.parseInt(url.searchParams.get("days") ?? "", 10);
            const days = Number.isFinite(n)
                ? Math.min(365, Math.max(1, n))
                : 30;
            return json(previewPayload(state.scenario, days, edits()));
        }

        if (req.method === "POST" && path === "/api/dashboard/body") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (!b) return json({ error: "invalid_request" }, 400);
            const tz = scenarioTz(state.scenario);
            const { resting_basis, ...bodyInput } = b;
            if (
                resting_basis !== undefined &&
                resting_basis !== "formula" &&
                resting_basis !== "calibrated"
            )
                return invalid("resting_basis must be formula or calibrated.");
            const checked = checkBodyPatch(bodyInput, todayInTz(tz));
            if (!checked.ok) return invalid(checked.error);
            const e = edits();
            const current =
                e.body ??
                bodyOf(buildScenario(state.scenario, todayInTz(tz)).profile);
            e.body = { ...current, ...checked.patch };
            if (resting_basis) e.restingBasis = resting_basis;
            return json({ ok: true, body: e.body });
        }

        if (
            req.method === "POST" &&
            path === "/api/dashboard/calibration/day"
        ) {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (
                !b ||
                typeof b.date !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
                !Number.isFinite(Date.parse(`${b.date}T00:00:00Z`)) ||
                new Date(`${b.date}T00:00:00Z`).toISOString().slice(0, 10) !==
                    b.date ||
                !(b.counted === null || typeof b.counted === "boolean")
            )
                return json({ error: "invalid_request" }, 400);
            const tz = scenarioTz(state.scenario);
            if (b.date > todayInTz(tz))
                return json({ error: "invalid_request" }, 400);
            const overrides = (edits().dayOverrides ??= {});
            if (b.counted === null) delete overrides[b.date];
            else overrides[b.date] = b.counted;
            return json({ ok: true });
        }

        if (req.method === "POST" && path === "/api/dashboard/goal") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (!b) return json({ error: "invalid_request" }, 400);
            const checked = checkCalorieGoal(b);
            if (!checked.ok) return invalid(checked.error);
            edits().goalCalories = checked.value;
            return json({ ok: true, calories: checked.value });
        }

        // Same validator as production (checkWeightEntry); stored in memory.
        if (req.method === "POST" && path === "/api/dashboard/weight") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (!b) return json({ error: "invalid_request" }, 400);
            const tz = scenarioTz(state.scenario);
            const fx = scenarioWithEdits(
                state.scenario,
                todayInTz(tz),
                edits(),
            );
            const checked = checkWeightEntry(b, {
                tz,
                preferredUnit: fx.profile.preferred_weight_unit,
                nowMs: Date.now(),
            });
            if (!checked.ok) return invalid(checked.error);
            const at = checked.value.logged_at ?? new Date().toISOString();
            const entry = {
                id: `preview-w-${++seq}`,
                user_id: fx.profile.user_id,
                weight_g: checked.value.weight_g,
                logged_at: at,
                notes: checked.value.notes ?? null,
                created_at: new Date().toISOString(),
                idempotency_key: null,
            };
            (edits().weights ??= []).push(entry);
            return json({
                ok: true,
                deduplicated: false,
                entry: {
                    id: entry.id,
                    logged_at: at,
                    date: dateInTz(at, tz),
                    weight_g: entry.weight_g,
                    notes: entry.notes,
                },
            });
        }

        // Same validator as production (checkMealPatch); stored in memory.
        const mealMatch = /^\/api\/dashboard\/meals\/([^/]+)$/.exec(path);
        if (req.method === "PATCH" && mealMatch) {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (!b) return json({ error: "invalid_request" }, 400);
            const id = decodeURIComponent(mealMatch[1]!);
            const tz = scenarioTz(state.scenario);
            const fx = scenarioWithEdits(
                state.scenario,
                todayInTz(tz),
                edits(),
            );
            const meal = fx.meals.find((m) => m.id === id);
            if (!meal) return json({ error: "not_found" }, 404);
            const checked = checkMealPatch(b, { tz, nowMs: Date.now() });
            if (!checked.ok) return invalid(checked.error);
            const e = edits();
            e.mealPatches ??= {};
            e.mealPatches[id] = {
                ...e.mealPatches[id],
                ...(checked.value as Partial<Meal>),
            };
            const saved = { ...meal, ...e.mealPatches[id] };
            return json({
                ok: true,
                meal: {
                    id: saved.id,
                    logged_at: saved.logged_at,
                    meal_type: saved.meal_type,
                    description: saved.description,
                    calories: saved.calories,
                    protein_g: saved.protein_g,
                    carbs_g: saved.carbs_g,
                    fat_g: saved.fat_g,
                    fiber_g: saved.fiber_g,
                    sugar_g: saved.sugar_g,
                },
            });
        }

        if (req.method === "GET" && path.startsWith("/dashboard-fonts/"))
            return (
                dashboardFontResponse(path.slice("/dashboard-fonts/".length)) ??
                new Response("Not found", { status: 404 })
            );

        return json({ error: "not_found" }, 404);
    },
});

console.log(
    `Dashboard preview: http://localhost:${server.port}/dashboard  (Supabase env blanked: ${!process.env.SUPABASE_URL && !process.env.SUPABASE_SECRET_KEY})`,
);
console.log(
    `  scenarios: ${SCENARIOS.join(", ")}  ·  ?delay=ms  ·  ?fail=500|401`,
);
