// POST /api/activity — the ingest side of activity-adjusted goals.
//
// Apple Health has no web API: the only way a server sees HealthKit data is
// something on the iPhone sending it. An iOS Shortcuts automation does that
// with no app to build (Find Health Samples → Calculate Statistics → Get
// Contents of URL), and it carries whatever wearable syncs into Health —
// Garmin Connect included. setup_activity_sync (src/mcp.ts) mints the token and
// prints the Shortcut recipe; this route is what the Shortcut calls.
//
// The body is the day's running TOTAL, not an increment, and the row is keyed
// by (user, local date), so an automation that fires hourly overwrites rather
// than accumulates.

import { Hono } from "hono";
import {
    upsertActivity,
    getNutritionGoals,
    getProfile,
    timezoneFromProfile,
    touchIngestToken,
} from "./supabase.js";
import { todayInTz } from "./tz.js";
import {
    adjustGoalsForActivity,
    checkActiveKcal,
    isLocalDate,
} from "./activity.js";
import {
    authenticateIngestToken,
    banRepeatAuthFailures,
    rateLimit,
} from "./middleware.js";

/** A short provenance label, never trusted for anything but display. */
function cleanSource(raw: unknown): string {
    if (typeof raw !== "string") return "apple_health";
    const s = raw
        .trim()
        .slice(0, 40)
        .replace(/[^\w .-]/g, "");
    return s || "apple_health";
}

export function createActivitySyncRouter(): Hono {
    const r = new Hono();

    r.post(
        "/api/activity",
        banRepeatAuthFailures,
        authenticateIngestToken,
        rateLimit,
        async (c) => {
            const userId = c.get("userId");
            let body: Record<string, unknown>;
            try {
                const parsed = await c.req.json();
                if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    Array.isArray(parsed)
                )
                    throw new Error("not an object");
                body = parsed as Record<string, unknown>;
            } catch {
                return c.json(
                    {
                        error: "invalid_request",
                        error_description:
                            'Body must be JSON like {"active_kcal": 312}.',
                    },
                    400,
                );
            }

            // Shortcuts' "Calculate Statistics" can hand over a bare number or
            // a string like "312.4"; checkActiveKcal accepts both.
            const kcal = checkActiveKcal(body.active_kcal);
            if (!kcal.ok)
                return c.json(
                    { error: "invalid_request", error_description: kcal.error },
                    400,
                );

            const profile = await getProfile(userId);
            const tz = timezoneFromProfile(profile) ?? "UTC";
            const today = todayInTz(tz);
            const date =
                typeof body.date === "string" && body.date.trim()
                    ? body.date.trim().slice(0, 10)
                    : today;
            if (!isLocalDate(date))
                return c.json(
                    {
                        error: "invalid_request",
                        error_description: `date must be YYYY-MM-DD, got "${String(body.date).slice(0, 40)}".`,
                    },
                    400,
                );
            if (date > today)
                return c.json(
                    {
                        error: "invalid_request",
                        error_description: `${date} is in the future (today is ${today} in ${tz}).`,
                    },
                    400,
                );

            const [, goals] = await Promise.all([
                upsertActivity(
                    userId,
                    date,
                    kcal.value,
                    cleanSource(body.source),
                ),
                getNutritionGoals(userId),
                touchIngestToken(userId).catch(() => {}),
            ]);
            const adj = adjustGoalsForActivity(goals, kcal.value);
            return c.json({
                ok: true,
                date,
                active_kcal: kcal.value,
                calorie_goal: adj.goals?.daily_calories ?? null,
                base_calorie_goal: goals?.daily_calories ?? null,
                message:
                    adj.goals?.daily_calories != null && adj.base
                        ? `Synced ${kcal.value} active kcal. Goal for ${date}: ${adj.goals.daily_calories} kcal.`
                        : `Synced ${kcal.value} active kcal for ${date}.`,
            });
        },
    );

    return r;
}
