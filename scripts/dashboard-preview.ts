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
//   ?scenario=full|over-goal|no-body|no-goals|empty|lb|calibrate
//   ?delay=2000        delay every data response (shows the skeletons)
//   ?fail=500|401      fail every data response
//
// Login error states: email 429@test → 429, bad@test → 401.
//
// Never mounted by src/index.ts, and it never touches Supabase: the env vars
// are blanked below, so an accidental call throws instead of reading real data
// (Bun auto-loads .env, so leaving them unexported would not be enough).

process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";

import { bodyOf } from "../src/dashboard.js";
import {
    SCENARIOS,
    isScenario,
    previewPayload,
    scenarioTz,
    buildScenario,
    type ScenarioName,
} from "../src/dashboard-fixture.js";
import { checkBodyPatch, type BodyDetails } from "../src/body.js";
import { todayInTz } from "../src/tz.js";

// Same string src/index.ts sends (src/dashboard-fixture.test.ts keeps the two
// in step), so a CSP violation shows up here before it shows up in prod.
export const PREVIEW_CSP =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self'; frame-ancestors 'none'";

const PORT = Number(process.env.DASHBOARD_PREVIEW_PORT ?? 8791);
const TOKEN = "preview-token";

const state: {
    scenario: ScenarioName;
    delay: number;
    fail: 0 | 401 | 500;
    // Body form saves, per scenario, in memory only.
    body: Partial<Record<ScenarioName, BodyDetails>>;
} = { scenario: "full", delay: 0, fail: 0, body: {} };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

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
    // Body form saves are forgotten too, so ?scenario=no-body always shows
    // the missing-details state it advertises.
    state.body = {};
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

        if (req.method === "GET" && path === "/api/dashboard/data") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            if (state.delay) await Bun.sleep(state.delay);
            if (state.fail === 401)
                return json({ error: "invalid_token" }, 401);
            if (state.fail === 500) return json({ error: "server_error" }, 500);
            const n = Number.parseInt(url.searchParams.get("days") ?? "", 10);
            const days = Number.isFinite(n)
                ? Math.min(365, Math.max(1, n))
                : 30;
            return json(
                previewPayload(
                    state.scenario,
                    days,
                    state.body[state.scenario],
                ),
            );
        }

        if (req.method === "POST" && path === "/api/dashboard/body") {
            if (!authed(req)) return json({ error: "invalid_token" }, 401);
            const b = await readJson(req);
            if (!b) return json({ error: "invalid_request" }, 400);
            const tz = scenarioTz(state.scenario);
            const checked = checkBodyPatch(b, todayInTz(tz));
            if (!checked.ok)
                return json(
                    {
                        error: "invalid_request",
                        error_description: checked.error,
                    },
                    400,
                );
            const current =
                state.body[state.scenario] ??
                bodyOf(buildScenario(state.scenario, todayInTz(tz)).profile);
            const saved = { ...current, ...checked.patch };
            state.body[state.scenario] = saved;
            return json({ ok: true, body: saved });
        }

        return json({ error: "not_found" }, 404);
    },
});

console.log(
    `Dashboard preview: http://localhost:${server.port}/dashboard  (Supabase env blanked: ${!process.env.SUPABASE_URL && !process.env.SUPABASE_SECRET_KEY})`,
);
console.log(
    `  scenarios: ${SCENARIOS.join(", ")}  ·  ?delay=ms  ·  ?fail=500|401`,
);
