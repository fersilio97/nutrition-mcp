// Personal dashboard: a browser view of your own logs.
//
// This exists because the MCP widgets (goal rings, trends) only render in a
// host that implements MCP Apps UI. A terminal client gets text, so a
// local-only instance has no visual view of its own data at all. These routes
// serve one.
//
// OFF BY DEFAULT. Set DASHBOARD_ENABLED=true to turn it on. The login route
// below accepts an email and password directly, which is a materially
// different exposure from the rest of this server: every other authenticated
// path takes an OAuth bearer token the client already holds, and nothing else
// here will check a password for an anonymous caller. On loopback that is
// fine. Reachable from the internet it is a brute-force target, so enabling it
// is a deliberate act rather than something a deploy inherits.

import { Hono } from "hono";
import crypto from "node:crypto";
import {
    signInUser,
    storeToken,
    getMealsInRange,
    getWaterInRange,
    getWeightInRange,
    getNutritionGoals,
    getProfile,
    getLatestWeight,
    getActivityInRange,
    activityByDate,
    upsertProfile,
    timezoneFromProfile,
    preferredWeightUnitFromProfile,
    type Profile,
} from "./supabase.js";
import { buildDailyBuckets } from "./insights.js";
import { todayInTz, shiftLocalDate, dateInTz } from "./tz.js";
import { authenticateBearer, rateLimitAuth } from "./middleware.js";
import { checkBodyPatch, type BodyDetails, type WeighIn } from "./body.js";
import { buildDashboardDays, buildWeightStats } from "./dashboard-stats.js";

// The weight rate needs a span longer than a day or a week to mean anything,
// so the weight tracker always looks back at least this far, whatever range
// the calorie charts show.
const WEIGHT_WINDOW_DAYS = 90;

export function bodyOf(profile: Profile | null): BodyDetails {
    return {
        height_cm:
            profile?.height_cm == null ? null : Number(profile.height_cm),
        birth_date: profile?.birth_date ?? null,
        sex: profile?.sex ?? null,
    };
}

export function dashboardEnabled(): boolean {
    return process.env.DASHBOARD_ENABLED === "true";
}

// Clamped so a hand-edited ?days= cannot ask for an unbounded scan of the
// meals table. 365 is already more than any chart here plots usefully.
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

function clampDays(raw: string | undefined): number {
    const n = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(n)) return DEFAULT_DAYS;
    return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

/**
 * Everything the page charts, for one user and range. Separate from the route
 * so it is testable without a bearer token (src/mcp.test.ts drives it through
 * the shared Supabase mock).
 */
export async function dashboardPayload(userId: string, days: number) {
    const profile = await getProfile(userId);
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const weightUnit = preferredWeightUnitFromProfile(profile) ?? "kg";

    const endDate = todayInTz(tz);
    const startDate = shiftLocalDate(endDate, -(days - 1));
    const weightStart = shiftLocalDate(
        endDate,
        -(Math.max(days, WEIGHT_WINDOW_DAYS) - 1),
    );

    const [meals, water, weight, goals, latestWeight, activityRows] =
        await Promise.all([
            getMealsInRange(userId, startDate, endDate, tz),
            getWaterInRange(userId, startDate, endDate, tz),
            getWeightInRange(userId, weightStart, endDate, tz),
            getNutritionGoals(userId),
            getLatestWeight(userId),
            // Optional enrichment: a missing activity table must not take
            // the whole dashboard down with it.
            getActivityInRange(userId, startDate, endDate).catch(() => []),
        ]);

    // The same bucketing the MCP trend tools use, so a figure here and a
    // figure the assistant quotes cannot disagree.
    const buckets = buildDailyBuckets(meals, water, startDate, endDate, tz);
    const weighIns: WeighIn[] = weight
        .map((w) => ({
            date: dateInTz(w.logged_at, tz),
            weight_g: w.weight_g,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const latest: WeighIn | null = latestWeight
        ? {
              date: dateInTz(latestWeight.logged_at, tz),
              weight_g: latestWeight.weight_g,
          }
        : null;
    // BMR needs a weight for every day, including days before the first
    // weigh-in in the window; the latest reading overall backs those.
    const weightsForBmr = weighIns.length || !latest ? weighIns : [latest];
    const body = bodyOf(profile);
    const activeByDate = activityByDate(activityRows);
    const dayRows = buildDashboardDays(
        buckets,
        activeByDate,
        goals,
        body,
        weightsForBmr,
        endDate,
    );

    return {
        timezone: tz,
        weightUnit,
        startDate,
        endDate,
        days,
        body,
        weightStats: buildWeightStats(
            weighIns,
            latest,
            body,
            goals,
            activeByDate.get(endDate) ?? null,
            endDate,
        ),
        weightWindowStart: weightStart,
        goals: goals
            ? {
                  calories: goals.daily_calories,
                  protein_g: goals.daily_protein_g,
                  carbs_g: goals.daily_carbs_g,
                  fat_g: goals.daily_fat_g,
                  fiber_g: goals.daily_fiber_g,
                  sugar_g: goals.daily_sugar_g,
                  water_ml: goals.daily_water_ml,
                  target_weight_g: goals.target_weight_g,
              }
            : null,
        // Per-day rows carry that day's EFFECTIVE goal (baseline + active
        // kcal) next to its totals; `goals` above stays the baseline.
        // Built field by field (dashboard-stats.ts), so the bucket's
        // mealTypes Set — which JSON.stringify renders as {} — never ships.
        daily: dayRows,
        weights: weight.map((w) => ({
            // Local calendar day, resolved here: the page slicing the UTC
            // ISO string would file an evening weigh-in under tomorrow.
            date: dateInTz(w.logged_at, tz),
            logged_at: w.logged_at,
            weight_g: w.weight_g,
        })),
        meals: meals
            .slice()
            .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
            .slice(0, 50)
            .map((m) => ({
                id: m.id,
                logged_at: m.logged_at,
                meal_type: m.meal_type,
                description: m.description,
                calories: m.calories,
                protein_g: m.protein_g,
                carbs_g: m.carbs_g,
                fat_g: m.fat_g,
                fiber_g: m.fiber_g,
                sugar_g: m.sugar_g,
            })),
    };
}

/** Validate and save the Body form (same rules as set_body_profile). */
export async function saveBodyDetails(
    userId: string,
    input: Record<string, unknown>,
): Promise<{ status: 200 | 400; json: Record<string, unknown> }> {
    const profile = await getProfile(userId);
    const today = todayInTz(timezoneFromProfile(profile) ?? "UTC");
    const checked = checkBodyPatch(input, today);
    if (!checked.ok)
        return {
            status: 400,
            json: {
                error: "invalid_request",
                error_description: checked.error,
            },
        };
    const saved = await upsertProfile(userId, checked.patch);
    return { status: 200, json: { ok: true, body: bodyOf(saved) } };
}

export function createDashboardRouter(): Hono {
    const dash = new Hono();

    // Exchange email + password for an access token. Deliberately does NOT
    // sign anyone up: the account is created through the OAuth flow when the
    // MCP client first connects, and a dashboard that could mint accounts
    // would be a second, weaker door onto the same data.
    dash.post("/api/dashboard/login", rateLimitAuth, async (c) => {
        let body: { email?: unknown; password?: unknown };
        try {
            body = await c.req.json();
        } catch {
            return c.json({ error: "invalid_request" }, 400);
        }

        const email =
            typeof body.email === "string"
                ? body.email.trim().toLowerCase()
                : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !password) {
            return c.json({ error: "invalid_request" }, 400);
        }

        let userId: string;
        try {
            userId = await signInUser(email, password);
        } catch {
            // One message for every failure mode. Distinguishing "no such
            // user" from "wrong password" would confirm which addresses have
            // accounts here.
            return c.json({ error: "invalid_credentials" }, 401);
        }

        const token = crypto.randomUUID();
        await storeToken(token, userId);
        return c.json({ access_token: token });
    });

    // Everything the page charts, in one call. One round trip keeps the page
    // from rendering half-populated while three fetches land.
    dash.get("/api/dashboard/data", authenticateBearer, async (c) => {
        const userId = c.get("userId") as string;
        return c.json(
            await dashboardPayload(userId, clampDays(c.req.query("days"))),
        );
    });

    // Save body details from the page's Body form. Same validation as the
    // set_body_profile tool (checkBodyPatch), so the two doors agree.
    dash.post("/api/dashboard/body", authenticateBearer, async (c) => {
        const userId = c.get("userId") as string;
        let body: Record<string, unknown>;
        try {
            const parsed = await c.req.json();
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                throw new Error("not an object");
            body = parsed as Record<string, unknown>;
        } catch {
            return c.json({ error: "invalid_request" }, 400);
        }
        const res = await saveBodyDetails(userId, body);
        return c.json(res.json, res.status);
    });

    return dash;
}
