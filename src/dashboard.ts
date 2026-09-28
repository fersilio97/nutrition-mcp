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
    timezoneFromProfile,
    preferredWeightUnitFromProfile,
} from "./supabase.js";
import { buildDailyBuckets } from "./insights.js";
import { todayInTz, shiftLocalDate } from "./tz.js";
import { authenticateBearer, rateLimitAuth } from "./middleware.js";

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
        const days = clampDays(c.req.query("days"));

        const profile = await getProfile(userId);
        const tz = timezoneFromProfile(profile) ?? "UTC";
        const weightUnit = preferredWeightUnitFromProfile(profile) ?? "kg";

        const endDate = todayInTz(tz);
        const startDate = shiftLocalDate(endDate, -(days - 1));

        const [meals, water, weight, goals] = await Promise.all([
            getMealsInRange(userId, startDate, endDate, tz),
            getWaterInRange(userId, startDate, endDate, tz),
            getWeightInRange(userId, startDate, endDate, tz),
            getNutritionGoals(userId),
        ]);

        // The same bucketing the MCP trend tools use, so a figure here and a
        // figure the assistant quotes cannot disagree.
        const buckets = buildDailyBuckets(meals, water, startDate, endDate, tz);

        return c.json({
            timezone: tz,
            weightUnit,
            startDate,
            endDate,
            days,
            goals: goals
                ? {
                      calories: goals.daily_calories,
                      protein_g: goals.daily_protein_g,
                      carbs_g: goals.daily_carbs_g,
                      fat_g: goals.daily_fat_g,
                      fiber_g: goals.daily_fiber_g,
                      sugar_g: goals.daily_sugar_g,
                      water_ml: goals.daily_water_ml,
                  }
                : null,
            // mealTypes is a Set, which JSON.stringify would silently render
            // as {} — drop it rather than ship an empty object the page might
            // one day try to read.
            daily: buckets.map((b) => ({
                date: b.date,
                calories: b.calories,
                protein_g: b.protein_g,
                carbs_g: b.carbs_g,
                fat_g: b.fat_g,
                fiber_g: b.fiber_g,
                sugar_g: b.sugar_g,
                waterMl: b.waterMl,
                mealCount: b.meals.length,
            })),
            weights: weight.map((w) => ({
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
        });
    });

    return dash;
}
