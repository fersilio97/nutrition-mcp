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
import { shiftLocalDate, todayInTz } from "./tz.js";
import { mergeByDay, parseSampleLines } from "./health-merge.js";
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

/** Most lines one request may carry: a week of iPhone samples is a few
 *  hundred, so this only stops a runaway Shortcut. */
const MAX_SAMPLE_LINES = 20000;
const MAX_LOOKBACK_DAYS = 14;

/**
 * The raw-samples body: `{"samples": "source|start|end|kcal\n…",
 * "lookback_days": 7}` (an array of lines is accepted too). Every day from
 * today back `lookback_days - 1` days that has samples is rebuilt with the
 * Health-style merge (src/health-merge.ts) and overwritten. Older days in the
 * payload are ignored: the Shortcut's "last N days" filter is a rolling window,
 * so the oldest day it returns is only partly covered and must not overwrite a
 * complete total. A day with no samples is left alone — a locked phone (Health
 * data is unreadable while locked) sends nothing, and that must never zero a day.
 */
async function ingestSamples(
    userId: string,
    body: Record<string, unknown>,
): Promise<[Record<string, unknown>, 200 | 400]> {
    const raw = Array.isArray(body.samples)
        ? body.samples.map(String).join("\n")
        : typeof body.samples === "string"
          ? body.samples
          : null;
    if (raw == null)
        return [
            {
                error: "invalid_request",
                error_description:
                    "samples must be text with one source|start|end|kcal line per sample.",
            },
            400,
        ];
    const lineCount = raw.split("\n").length;
    if (lineCount > MAX_SAMPLE_LINES)
        return [
            {
                error: "invalid_request",
                error_description: `Too many samples (${lineCount}); send at most ${MAX_SAMPLE_LINES}.`,
            },
            400,
        ];
    const n = Number(body.lookback_days ?? 7);
    const lookback = Number.isFinite(n)
        ? Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.round(n)))
        : 7;

    const profile = await getProfile(userId);
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const today = todayInTz(tz);
    const earliest = shiftLocalDate(today, -(lookback - 1));
    const { samples, rejected } = parseSampleLines(raw);
    const merged = mergeByDay(samples, tz);
    // Belt and braces for a client whose fetch window equals lookback_days:
    // the oldest day in any payload is assumed cut off by the rolling window
    // and never written, unless it is today (a window shorter than a day is
    // not one a Shortcut can express).
    const oldest = merged[0]?.date;
    const days = merged.filter(
        (d) =>
            d.date >= earliest &&
            d.date <= today &&
            (d.date !== oldest || d.date === today),
    );

    const written: Record<string, unknown>[] = [];
    for (const d of days) {
        const kcal = checkActiveKcal(Math.round(d.kcal));
        if (!kcal.ok) {
            written.push({ date: d.date, skipped: kcal.error });
            continue;
        }
        await upsertActivity(userId, d.date, kcal.value, "health_merged");
        written.push({
            date: d.date,
            active_kcal: kcal.value,
            by_source: Object.fromEntries(
                Object.entries(d.bySource).map(([k, v]) => [k, Math.round(v)]),
            ),
        });
    }
    await touchIngestToken(userId).catch(() => {});
    const todayRow = written.find((w) => w.date === today);
    return [
        {
            ok: true,
            days: written,
            samples: samples.length,
            rejected_lines: rejected,
            message:
                samples.length === 0
                    ? "No samples received — Health is unreadable while the phone is locked, so nothing was changed."
                    : `Synced ${written.length} day(s)` +
                      (todayRow
                          ? `; today ${todayRow.active_kcal} active kcal.`
                          : "."),
        },
        200,
    ];
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

            if (body.samples !== undefined)
                return c.json(...(await ingestSamples(userId, body)));

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
