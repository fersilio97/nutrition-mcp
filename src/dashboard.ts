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
    insertWeight,
    updateMeal,
    timezoneFromProfile,
    preferredWeightUnitFromProfile,
    type ActivityDay,
    type Meal,
    type MealInput,
    type NutritionGoals,
    type Profile,
    type WaterEntry,
    type WeightEntry,
} from "./supabase.js";
import { buildDailyBuckets } from "./insights.js";
import {
    todayInTz,
    shiftLocalDate,
    dateInTz,
    resolveWriteLoggedAt,
    LoggedAtError,
} from "./tz.js";
import {
    isPlausibleWeightGrams,
    isWeightUnit,
    toGrams,
    MIN_PLAUSIBLE_WEIGHT_G,
    MAX_PLAUSIBLE_WEIGHT_G,
    type WeightUnit,
} from "./units.js";
import { MAX_CALORIES, MAX_MACRO_G } from "./import.js";
import { authenticateBearer, rateLimitAuth } from "./middleware.js";
import { checkBodyPatch, type BodyDetails, type WeighIn } from "./body.js";
import {
    buildDashboardDays,
    buildEstimateVsScale,
    buildLast7,
    buildWeightStats,
    LAST7_DAYS,
} from "./dashboard-stats.js";

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
 * The local-date windows one request covers: the charts' [startDate, endDate],
 * the weight tracker's longer [weightStart, endDate], and [fetchStart,
 * endDate] for meals/water/activity — the chart range widened to cover the
 * Today tab's fixed 7-day figures (`last7`), so those never depend on the
 * range the Trends tab shows. One helper so the fetch, the payload and the
 * dev preview's fixture filter cannot disagree.
 */
export function dashboardWindow(
    today: string,
    days: number,
): {
    startDate: string;
    endDate: string;
    weightStart: string;
    fetchStart: string;
} {
    const startDate = shiftLocalDate(today, -(days - 1));
    const last7Start = shiftLocalDate(today, -LAST7_DAYS);
    return {
        startDate,
        endDate: today,
        weightStart: shiftLocalDate(
            today,
            -(Math.max(days, WEIGHT_WINDOW_DAYS) - 1),
        ),
        fetchStart: last7Start < startDate ? last7Start : startDate,
    };
}

/** What dashboardPayload fetches, already filtered to dashboardWindow. */
export interface DashboardInputs {
    profile: Profile | null;
    meals: Meal[];
    water: WaterEntry[];
    weight: WeightEntry[];
    goals: NutritionGoals | null;
    latestWeight: WeightEntry | null;
    activityRows: ActivityDay[];
    days: number;
    /** The user's local today, YYYY-MM-DD. */
    today: string;
}

/**
 * Everything the page charts, for one user and range. Separate from the route
 * so it is testable without a bearer token (src/mcp.test.ts drives it through
 * the shared Supabase mock).
 */
export async function dashboardPayload(userId: string, days: number) {
    const profile = await getProfile(userId);
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const today = todayInTz(tz);
    const { endDate, weightStart, fetchStart } = dashboardWindow(today, days);

    const [meals, water, weight, goals, latestWeight, activityRows] =
        await Promise.all([
            getMealsInRange(userId, fetchStart, endDate, tz),
            getWaterInRange(userId, fetchStart, endDate, tz),
            getWeightInRange(userId, weightStart, endDate, tz),
            getNutritionGoals(userId),
            getLatestWeight(userId),
            // Optional enrichment: a missing activity table must not take
            // the whole dashboard down with it.
            getActivityInRange(userId, fetchStart, endDate).catch(() => []),
        ]);

    return buildDashboardPayload({
        profile,
        meals,
        water,
        weight,
        goals,
        latestWeight,
        activityRows,
        days,
        today,
    });
}

/**
 * The pure half of dashboardPayload: rows in, page JSON out. No Supabase, so
 * the dev preview (scripts/dashboard-preview.ts) renders the real page from
 * synthetic rows through exactly the code production runs.
 */
export function buildDashboardPayload(inputs: DashboardInputs) {
    const {
        profile,
        meals,
        water,
        weight,
        goals,
        latestWeight,
        activityRows,
        days,
        today,
    } = inputs;
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const weightUnit = preferredWeightUnitFromProfile(profile) ?? "kg";
    const { startDate, endDate, weightStart, fetchStart } = dashboardWindow(
        today,
        days,
    );

    // The same bucketing the MCP trend tools use, so a figure here and a
    // figure the assistant quotes cannot disagree. Bucketed from fetchStart
    // (the range, widened for `last7`); `daily` is then cut back to the range.
    const buckets = buildDailyBuckets(meals, water, fetchStart, endDate, tz);
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
    const allRows = buildDashboardDays(
        buckets,
        activeByDate,
        goals,
        body,
        weightsForBmr,
        endDate,
    );
    const dayRows = allRows.filter((r) => r.date >= startDate);
    const inRange = (iso: string) => {
        const d = dateInTz(iso, tz);
        return d >= startDate && d <= endDate;
    };

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
        // The period's estimated change next to what the scale did. The
        // weigh-ins cover max(days, 90), so every range has them all.
        estimateVsScale: buildEstimateVsScale(
            dayRows,
            weighIns,
            startDate,
            endDate,
        ),
        // Today's two 7-day figures, from the widened rows: fixed to the
        // last week whatever the selected range.
        last7: buildLast7(allRows, weighIns, endDate),
        weights: weight.map((w) => ({
            // Local calendar day, resolved here: the page slicing the UTC
            // ISO string would file an evening weigh-in under tomorrow.
            date: dateInTz(w.logged_at, tz),
            logged_at: w.logged_at,
            weight_g: w.weight_g,
        })),
        // Only the range's meals: the fetch reaches back further for last7.
        meals: meals
            .filter((m) => inRange(m.logged_at))
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

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
type Reply = { status: 200 | 400 | 404; json: Record<string, unknown> };
const invalid = (error_description: string): Reply => ({
    status: 400,
    json: { error: "invalid_request", error_description },
});
const MAX_NOTE_CHARS = 1000;
const MAX_DESCRIPTION_CHARS = 2000;

/** A timestamp from the page: an offset-less local "YYYY-MM-DDTHH:MM" in the
 *  profile timezone, resolved by the same rules as log_weight / update_meal
 *  (no past bound, 5-minute future tolerance). */
function checkLoggedAt(
    raw: unknown,
    tz: string,
    nowMs: number,
): Checked<string> {
    if (typeof raw !== "string" || !raw.trim())
        return { ok: false, error: "logged_at must be a date and time." };
    try {
        return {
            ok: true,
            value: resolveWriteLoggedAt(
                raw.trim(),
                tz,
                nowMs,
            ).instant.toISOString(),
        };
    } catch (err) {
        if (err instanceof LoggedAtError)
            return { ok: false, error: err.message };
        throw err;
    }
}

function toNumber(raw: unknown): number | null {
    const n = typeof raw === "string" ? Number(raw.trim()) : raw;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Validate the page's "Log weight" form — the same conversions and bounds as
 * the log_weight tool (toGrams, isPlausibleWeightGrams, resolveWriteLoggedAt).
 * Pure, so the dev preview applies exactly these rules to its in-memory store.
 */
export function checkWeightEntry(
    input: Record<string, unknown>,
    opts: { tz: string; preferredUnit: WeightUnit | null; nowMs: number },
): Checked<{ weight_g: number; logged_at?: string; notes?: string }> {
    const value = toNumber(input.weight);
    if (value == null || value <= 0)
        return { ok: false, error: "weight must be a number above 0." };
    const unit = input.unit ?? opts.preferredUnit;
    if (!isWeightUnit(unit))
        return { ok: false, error: 'unit must be "kg" or "lb".' };
    const weight_g = toGrams(value, unit);
    if (!isPlausibleWeightGrams(weight_g))
        return {
            ok: false,
            error: `${value} ${unit} is outside ${MIN_PLAUSIBLE_WEIGHT_G / 1000}–${MAX_PLAUSIBLE_WEIGHT_G / 1000} kg — check the unit.`,
        };
    const out: { weight_g: number; logged_at?: string; notes?: string } = {
        weight_g,
    };
    // Omitted means "now", exactly like log_weight.
    if (input.logged_at !== undefined && input.logged_at !== "") {
        const at = checkLoggedAt(input.logged_at, opts.tz, opts.nowMs);
        if (!at.ok) return at;
        out.logged_at = at.value;
    }
    if (
        input.notes !== undefined &&
        input.notes !== null &&
        input.notes !== ""
    ) {
        if (typeof input.notes !== "string")
            return { ok: false, error: "notes must be text." };
        const notes = input.notes.trim();
        if (notes.length > MAX_NOTE_CHARS)
            return {
                ok: false,
                error: `notes is longer than ${MAX_NOTE_CHARS} characters.`,
            };
        if (notes) out.notes = notes;
    }
    return { ok: true, value: out };
}

/** Save a weigh-in from the page. insertWeight's idempotency is unchanged:
 *  resubmitting the identical entry returns the original row. */
export async function logWeightFromDashboard(
    userId: string,
    input: Record<string, unknown>,
): Promise<Reply> {
    const profile = await getProfile(userId);
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const checked = checkWeightEntry(input, {
        tz,
        preferredUnit: preferredWeightUnitFromProfile(profile),
        nowMs: Date.now(),
    });
    if (!checked.ok) return invalid(checked.error);
    const { entry, deduplicated } = await insertWeight(userId, checked.value);
    return {
        status: 200,
        json: {
            ok: true,
            deduplicated,
            entry: {
                id: entry.id,
                logged_at: entry.logged_at,
                date: dateInTz(entry.logged_at, tz),
                weight_g: entry.weight_g,
                notes: entry.notes,
            },
        },
    };
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
// update_meal's own bounds (src/import.ts, re-exported by src/mcp.ts).
const MEAL_NUMBER_BOUNDS: Record<string, number> = {
    calories: MAX_CALORIES,
    protein_g: MAX_MACRO_G,
    carbs_g: MAX_MACRO_G,
    fat_g: MAX_MACRO_G,
    fiber_g: MAX_MACRO_G,
    sugar_g: MAX_MACRO_G,
};
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate the page's meal edit. The page sends ONLY the fields that changed,
 * and only those reach updateMeal, so anything it does not show (alcohol,
 * caffeine, notes) is left exactly as it was. Unknown keys are refused rather
 * than dropped, so a typo cannot look like a successful save.
 */
export function checkMealPatch(
    input: Record<string, unknown>,
    opts: { tz: string; nowMs: number },
): Checked<Partial<MealInput>> {
    const patch: Record<string, string | number> = {};
    for (const [key, raw] of Object.entries(input)) {
        if (key === "description") {
            if (typeof raw !== "string" || !raw.trim())
                return { ok: false, error: "description can't be empty." };
            if (raw.trim().length > MAX_DESCRIPTION_CHARS)
                return {
                    ok: false,
                    error: `description is longer than ${MAX_DESCRIPTION_CHARS} characters.`,
                };
            patch.description = raw.trim();
        } else if (key === "meal_type") {
            if (!MEAL_TYPES.includes(raw as (typeof MEAL_TYPES)[number]))
                return {
                    ok: false,
                    error: "meal_type must be breakfast, lunch, dinner or snack.",
                };
            patch.meal_type = raw as string;
        } else if (key in MEAL_NUMBER_BOUNDS) {
            // Clearing is refused, as update_meal cannot clear either:
            // updateMeal stores calories via toStoredInteger, where null
            // would round to a silent 0 — a fake measurement.
            if (raw === null || raw === "")
                return {
                    ok: false,
                    error: `${key} can't be cleared — enter 0 if there was none.`,
                };
            const n = toNumber(raw);
            const max = MEAL_NUMBER_BOUNDS[key]!;
            if (n == null || n < 0 || n > max)
                return {
                    ok: false,
                    error: `${key} must be a number from 0 to ${max.toLocaleString("en-US")}.`,
                };
            patch[key] = n;
        } else if (key === "logged_at") {
            const at = checkLoggedAt(raw, opts.tz, opts.nowMs);
            if (!at.ok) return at;
            patch.logged_at = at.value;
        } else {
            return { ok: false, error: `${key} can't be edited here.` };
        }
    }
    if (!Object.keys(patch).length)
        return { ok: false, error: "Nothing to change." };
    // Keys and value types were checked one by one above.
    return { ok: true, value: patch as Partial<MealInput> };
}

/** The page's meal edit. 404 for an id that is not one of this user's meals
 *  (updateMeal looks it up and writes it scoped by user_id). */
export async function updateMealFromDashboard(
    userId: string,
    id: string,
    input: Record<string, unknown>,
): Promise<Reply> {
    const notFound: Reply = { status: 404, json: { error: "not_found" } };
    // A non-uuid would fail the uuid column's cast as a 500; it can't be a
    // meal, so it is simply not found.
    if (!UUID_RE.test(id)) return notFound;
    const profile = await getProfile(userId);
    const checked = checkMealPatch(input, {
        tz: timezoneFromProfile(profile) ?? "UTC",
        nowMs: Date.now(),
    });
    if (!checked.ok) return invalid(checked.error);
    let saved: Meal;
    try {
        saved = await updateMeal(userId, id, checked.value);
    } catch (err) {
        if (err instanceof Error && /meal not found/.test(err.message))
            return notFound;
        throw err;
    }
    return {
        status: 200,
        json: {
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
        },
    };
}

async function readObject(c: {
    req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown> | null> {
    try {
        const parsed = await c.req.json();
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
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

    // Log a weigh-in from the page — the log_weight tool's rules, no LLM.
    dash.post("/api/dashboard/weight", authenticateBearer, async (c) => {
        const body = await readObject(c);
        if (!body) return c.json({ error: "invalid_request" }, 400);
        const res = await logWeightFromDashboard(
            c.get("userId") as string,
            body,
        );
        return c.json(res.json, res.status);
    });

    // Edit one of the user's meals from the Meals tab — update_meal's rules.
    dash.patch("/api/dashboard/meals/:id", authenticateBearer, async (c) => {
        const body = await readObject(c);
        if (!body) return c.json({ error: "invalid_request" }, 400);
        const res = await updateMealFromDashboard(
            c.get("userId") as string,
            c.req.param("id") ?? "",
            body,
        );
        return c.json(res.json, res.status);
    });

    return dash;
}
