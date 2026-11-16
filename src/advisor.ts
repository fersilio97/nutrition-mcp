import { coveredDailyAverage, type DailyBucket } from "./insights.js";
import type { Meal, NutritionGoals } from "./supabase.js";
import { hourInTz } from "./tz.js";

/**
 * Rule-based weekly eating review: a 0–100 score, what went well, what to
 * improve. Pure — no Supabase, no clock — so it unit-tests with fixtures and the
 * dashboard route and the MCP tool can share it. Every rule is skipped when the
 * data it needs is missing, and every threshold is a named constant below so
 * the rubric can be tuned in one place.
 *
 * `advice` is the slot a later, LLM-written narrative fills (a weekly Claude
 * routine, not a server-side call). It is always null here.
 */

/** Days the review looks at: the complete days ending at the window's end. */
export const ADVISOR_DAYS = 7;

// ---------- Tunable rubric ----------

/** Fewer logged days than this and a score would mostly measure what was
 * forgotten, not what was eaten. */
export const MIN_LOGGED_DAYS = 4;

/** Hours counted as "evening" for the back-loaded rule: 19:00 up to and
 * including 03:59 local. */
export const LATE_FROM_HOUR = 19;
export const LATE_BEFORE_HOUR = 4;
/** Share of a day's kcal eaten in that late window. A normal dinner plus an
 * evening snack is often 40-50%, so "good" sits at 40%. */
export const BACK_LOADED_IMPROVE = 0.55;
export const BACK_LOADED_GOOD = 0.4;
/** The score reaches zero at this late share. */
export const BACK_LOADED_ZERO_SCORE = 0.7;
/** A day with fewer meals than this (only dinner logged, say) says nothing
 * about how the day was spread, so it is left out of the late share. */
export const MIN_MEALS_FOR_TIMING = 2;

/** A day is an overeat day above BOTH of these. */
export const OVEREAT_VS_MEDIAN = 1.35;
export const OVEREAT_VS_GOAL = 1.25;

/** "On target" is within this fraction of the calorie goal. */
/** Logging error alone is 10-20%, so a tighter band mostly measures noise. */
export const ON_TARGET_TOLERANCE = 0.15;
export const ON_TARGET_GOOD_RATIO = 0.7;
export const ON_TARGET_IMPROVE_RATIO = 0.45;

/** Protein target without a goal: g per kg of latest body weight. */
export const PROTEIN_G_PER_KG = 1.2;
export const PROTEIN_IMPROVE = 0.8;
/** Fiber target without a goal: the IOM adequate intake per 1000 kcal. */
export const FIBER_G_PER_1000_KCAL = 14;
export const FIBER_IMPROVE = 0.7;
/** Alcohol ceiling without a goal, grams of ethanol per day (about 1 US
 * standard drink; 14 units a week in the UK is about 16 g a day). */
export const ALCOHOL_DEFAULT_G_PER_DAY = 14;
export const BREAKFAST_IMPROVE = 0.5;
export const BREAKFAST_GOOD = 0.85;
export const HYDRATION_IMPROVE = 0.7;

/** Points out of 100. A component with no data drops out and the remaining
 * weights are rescaled, so a missing goal never silently costs points. */
export const COMPONENT_WEIGHTS = {
    energy: 20,
    protein: 20,
    fiber: 15,
    timing: 20,
    sugarAlcohol: 15,
    hydration: 10,
} as const;

export type ComponentId = keyof typeof COMPONENT_WEIGHTS;

const COMPONENT_LABELS: Record<ComponentId, string> = {
    energy: "Calorie consistency",
    protein: "Protein",
    fiber: "Fiber",
    timing: "Meal timing",
    sugarAlcohol: "Sugar & alcohol",
    hydration: "Hydration",
};

// ---------- Types ----------

export interface AdvisorFinding {
    id: string;
    kind: "good" | "improve";
    title: string;
    detail: string;
    evidence: Record<string, number>;
}

export interface AdvisorComponent {
    id: ComponentId;
    label: string;
    /** Nominal weight before rescaling. */
    weight: number;
    /** 0..1, or null when the data to judge it was missing. */
    score: number | null;
    /** Points this component adds to the 0–100 score after rescaling. */
    points: number;
}

export interface AdvisorReport {
    window: { start: string; end: string };
    windowDays: number;
    loggedDays: number;
    enoughData: boolean;
    score: number | null;
    verdict: string | null;
    components: AdvisorComponent[];
    findings: AdvisorFinding[];
    /** Reserved for the LLM-written narrative. */
    advice: null;
}

export interface AdvisorOptions {
    tz: string;
    /** Latest logged weight in kg, for the protein fallback target. */
    weightKg: number | null;
    /** Alcohol is opt-in; without it the rule stays silent. */
    alcoholEnabled: boolean;
}

// ---------- Helpers ----------

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function round(n: number, places = 1): number {
    const f = 10 ** places;
    return Math.round(n * f) / f;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/** Bucket dates are already local calendar dates, so the weekday is read from
 * the date string itself rather than re-resolved through a timezone. */
function weekdayOf(date: string): { index: number; name: string } {
    const index = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { index, name: WEEKDAYS[index]! };
}

function isLate(m: Meal, tz: string): boolean {
    const h = hourInTz(m.logged_at, tz);
    return h >= LATE_FROM_HOUR || h < LATE_BEFORE_HOUR;
}

/** Share of one day's kcal logged in the late window, or null for a day too
 * thin to judge (under MIN_MEALS_FOR_TIMING meals, or no energy to apportion). */
function lateShare(bucket: DailyBucket, tz: string): number | null {
    if (bucket.meals.length < MIN_MEALS_FOR_TIMING) return null;
    const total = bucket.meals.reduce((s, m) => s + (m.calories ?? 0), 0);
    if (total <= 0) return null;
    const late = bucket.meals
        .filter((m) => isLate(m, tz))
        .reduce((s, m) => s + (m.calories ?? 0), 0);
    return late / total;
}

function verdictFor(score: number): string {
    if (score >= 80) return "A strong week";
    if (score >= 60) return "A solid week with room to improve";
    if (score >= 40) return "An uneven week";
    return "A week that needs attention";
}

// ---------- The report ----------

export function buildAdvisorReport(
    buckets: DailyBucket[],
    goals: NutritionGoals | null,
    opts: AdvisorOptions,
): AdvisorReport {
    const windowDays = buckets.length;
    const logged = buckets.filter((b) => b.meals.length > 0);
    const base = {
        window: {
            start: buckets[0]?.date ?? "",
            end: buckets[buckets.length - 1]?.date ?? "",
        },
        windowDays,
        loggedDays: logged.length,
        advice: null,
    } as const;

    const blank = (id: ComponentId): AdvisorComponent => ({
        id,
        label: COMPONENT_LABELS[id],
        weight: COMPONENT_WEIGHTS[id],
        score: null,
        points: 0,
    });

    if (logged.length < MIN_LOGGED_DAYS) {
        return {
            ...base,
            enoughData: false,
            score: null,
            verdict: null,
            components: (Object.keys(COMPONENT_WEIGHTS) as ComponentId[]).map(
                blank,
            ),
            findings: [
                {
                    id: "logging",
                    kind: "improve",
                    title: "Not enough logged days for a review",
                    detail: `Only ${logged.length} of the last ${windowDays} days have meals logged. Log at least ${MIN_LOGGED_DAYS} days to get a score.`,
                    evidence: {
                        loggedDays: logged.length,
                        windowDays,
                    },
                },
            ],
        };
    }

    const findings: AdvisorFinding[] = [];
    const scores: Partial<Record<ComponentId, number>> = {};
    const note = (f: AdvisorFinding) => findings.push(f);

    // --- Calorie consistency (needs a calorie goal) ---
    const calGoal = goals?.daily_calories ?? null;
    if (calGoal != null && calGoal > 0) {
        const onTarget = logged.filter(
            (b) =>
                Math.abs(b.calories - calGoal) <= calGoal * ON_TARGET_TOLERANCE,
        ).length;
        const ratio = onTarget / logged.length;
        scores.energy = clamp01(ratio / ON_TARGET_GOOD_RATIO);
        const evidence = {
            onTargetDays: onTarget,
            loggedDays: logged.length,
            goalKcal: calGoal,
        };
        if (ratio >= ON_TARGET_GOOD_RATIO) {
            note({
                id: "energy-consistency",
                kind: "good",
                title: "Calories close to your goal",
                detail: `${onTarget} of ${logged.length} logged days landed within ${ON_TARGET_TOLERANCE * 100}% of your ${calGoal} kcal goal.`,
                evidence,
            });
        } else if (ratio < ON_TARGET_IMPROVE_RATIO) {
            note({
                id: "energy-consistency",
                kind: "improve",
                title: "Calories drifted from your goal",
                detail: `Only ${onTarget} of ${logged.length} logged days landed within ${ON_TARGET_TOLERANCE * 100}% of your ${calGoal} kcal goal.`,
                evidence,
            });
        }
    }

    // --- Protein ---
    const proteinTarget =
        goals?.daily_protein_g ??
        (opts.weightKg != null ? opts.weightKg * PROTEIN_G_PER_KG : null);
    if (proteinTarget != null && proteinTarget > 0) {
        const avg = mean(logged.map((b) => b.protein_g));
        const ratio = avg / proteinTarget;
        scores.protein = clamp01(ratio);
        const evidence = {
            avgG: round(avg),
            targetG: round(proteinTarget),
        };
        const source = goals?.daily_protein_g != null ? "goal" : "estimate";
        if (ratio >= 1) {
            note({
                id: "protein",
                kind: "good",
                title: "Protein on target",
                detail: `You averaged ${round(avg, 0)} g a day against a ${source} of ${round(proteinTarget, 0)} g.`,
                evidence,
            });
        } else if (ratio < PROTEIN_IMPROVE) {
            note({
                id: "protein",
                kind: "improve",
                title: "Protein is low",
                detail: `You averaged ${round(avg, 0)} g a day against a ${source} of ${round(proteinTarget, 0)} g.`,
                evidence,
            });
        }
    }

    // --- Fiber (only days that carry it) ---
    const fiber = coveredDailyAverage(
        logged.map((b) => b.meals),
        "fiber_g",
    );
    if (fiber.avg != null) {
        const target =
            goals?.daily_fiber_g ??
            (mean(logged.map((b) => b.calories)) / 1000) *
                FIBER_G_PER_1000_KCAL;
        const ratio = target > 0 ? fiber.avg / target : 1;
        scores.fiber = clamp01(ratio);
        const evidence = {
            avgG: round(fiber.avg),
            targetG: round(target),
            daysWithData: fiber.days,
        };
        if (ratio >= 1) {
            note({
                id: "fiber",
                kind: "good",
                title: "Fiber on target",
                detail: `You averaged ${round(fiber.avg, 0)} g a day (target ${round(target, 0)} g).`,
                evidence,
            });
        } else if (ratio < FIBER_IMPROVE) {
            note({
                id: "fiber",
                kind: "improve",
                title: "Fiber is low",
                detail: `You averaged ${round(fiber.avg, 0)} g a day against a target of ${round(target, 0)} g. Vegetables, fruit, legumes and whole grains close this gap.`,
                evidence,
            });
        }
    }

    // --- Meal timing: back-loaded eating and overeat days ---
    const shares = logged
        .map((b) => lateShare(b, opts.tz))
        .filter((s): s is number => s != null);
    let backScore: number | null = null;
    if (shares.length > 0) {
        const avgShare = mean(shares);
        backScore = clamp01(
            (BACK_LOADED_ZERO_SCORE - avgShare) /
                (BACK_LOADED_ZERO_SCORE - BACK_LOADED_GOOD),
        );
        const evidence = { lateSharePct: round(avgShare * 100, 0) };
        if (avgShare >= BACK_LOADED_IMPROVE) {
            note({
                id: "back-loaded",
                kind: "improve",
                title: "Most of your food comes late",
                detail: `About ${round(avgShare * 100, 0)}% of your calories were eaten after ${LATE_FROM_HOUR}:00. Eating little early and a lot at night is a common cause of evening hunger; a bigger breakfast or lunch usually helps.`,
                evidence,
            });
        } else if (avgShare <= BACK_LOADED_GOOD) {
            note({
                id: "back-loaded",
                kind: "good",
                title: "Calories spread through the day",
                detail: `Only about ${round(avgShare * 100, 0)}% of your calories came after ${LATE_FROM_HOUR}:00.`,
                evidence,
            });
        }
    }

    const med = median(logged.map((b) => b.calories));
    const overeat = logged.filter(
        (b) =>
            med > 0 &&
            b.calories > med * OVEREAT_VS_MEDIAN &&
            (calGoal == null || b.calories > calGoal * OVEREAT_VS_GOAL),
    );
    for (const b of overeat) {
        const { index, name } = weekdayOf(b.date);
        const weekend = index === 0 || index === 6;
        note({
            id: "overeat-day",
            kind: "improve",
            title: `${name} was a big day`,
            detail: `${name} ${b.date} came to ${round(b.calories, 0)} kcal, about ${round((b.calories / med - 1) * 100, 0)}% above your typical day${weekend ? " — a weekend spike" : ""}.`,
            evidence: {
                kcal: round(b.calories, 0),
                typicalKcal: round(med, 0),
            },
        });
    }
    if (med > 0 && overeat.length === 0) {
        note({
            id: "overeat-day",
            kind: "good",
            title: "No big spike days",
            detail: "No day ran far above your typical intake.",
            evidence: { typicalKcal: round(med, 0) },
        });
    }
    if (backScore != null) {
        const overScore = Math.max(0, 1 - 0.5 * overeat.length);
        scores.timing = 0.6 * backScore + 0.4 * overScore;
    }

    // --- Sugar & alcohol ---
    const sugar = coveredDailyAverage(
        logged.map((b) => b.meals),
        "sugar_g",
    );
    const sub: number[] = [];
    // Sugar is judged only against a goal the user set: the log carries TOTAL
    // sugars (fruit and milk included), and the usual limit is for free sugars.
    const sugarCeiling = goals?.daily_sugar_g ?? null;
    if (sugar.avg != null && sugarCeiling != null && sugarCeiling > 0) {
        const over = sugar.avg > sugarCeiling;
        sub.push(over ? clamp01(sugarCeiling / sugar.avg) : 1);
        const evidence = {
            avgG: round(sugar.avg),
            ceilingG: round(sugarCeiling),
            daysWithData: sugar.days,
        };
        if (over) {
            note({
                id: "sugar",
                kind: "improve",
                title: "Sugar runs above your limit",
                detail: `You averaged ${round(sugar.avg, 0)} g of total sugars a day against your ceiling of ${round(sugarCeiling, 0)} g.`,
                evidence,
            });
        } else {
            note({
                id: "sugar",
                kind: "good",
                title: "Sugar within your limit",
                detail: `You averaged ${round(sugar.avg, 0)} g of total sugars a day (your ceiling is ${round(sugarCeiling, 0)} g).`,
                evidence,
            });
        }
    }
    if (opts.alcoholEnabled) {
        const drinkDays = logged.filter((b) => b.alcohol_g > 0).length;
        const avgAlcohol = mean(logged.map((b) => b.alcohol_g));
        const ceiling = goals?.daily_alcohol_g ?? ALCOHOL_DEFAULT_G_PER_DAY;
        const over = avgAlcohol > ceiling;
        sub.push(over ? clamp01(ceiling / avgAlcohol) : 1);
        const evidence = {
            drinkingDays: drinkDays,
            avgG: round(avgAlcohol),
            ceilingG: round(ceiling),
        };
        if (over) {
            note({
                id: "alcohol",
                kind: "improve",
                title: "Alcohol above your limit",
                detail: `Alcohol averaged ${round(avgAlcohol, 0)} g a day across ${drinkDays} of ${logged.length} logged days, above ${round(ceiling, 0)} g.`,
                evidence,
            });
        } else if (drinkDays === 0) {
            note({
                id: "alcohol",
                kind: "good",
                title: "No alcohol this week",
                detail: "No alcohol was logged on any day.",
                evidence,
            });
        }
    }
    if (sub.length > 0) scores.sugarAlcohol = mean(sub);

    // --- Breakfast (skipped when meals aren't tagged with a type at all) ---
    if (logged.some((b) => b.mealTypes.size > 0)) {
        const withBreakfast = logged.filter((b) =>
            b.mealTypes.has("breakfast"),
        ).length;
        const share = withBreakfast / logged.length;
        const evidence = {
            breakfastDays: withBreakfast,
            loggedDays: logged.length,
        };
        if (share >= BREAKFAST_GOOD) {
            note({
                id: "breakfast",
                kind: "good",
                title: "Regular breakfasts",
                detail: `You logged breakfast on ${withBreakfast} of ${logged.length} days.`,
                evidence,
            });
        } else if (share < BREAKFAST_IMPROVE) {
            note({
                id: "breakfast",
                kind: "improve",
                title: "Breakfast is often skipped",
                detail: `Breakfast shows up on only ${withBreakfast} of ${logged.length} logged days. Skipping it is not harmful in itself, but it matters if it leaves you hungry and eating a lot late.`,
                evidence,
            });
        }
    }

    // --- Hydration (needs a water goal) ---
    const waterGoal = goals?.daily_water_ml ?? null;
    if (waterGoal != null && waterGoal > 0) {
        const avg = mean(logged.map((b) => b.waterMl));
        const ratio = avg / waterGoal;
        scores.hydration = clamp01(ratio);
        const evidence = { avgMl: round(avg, 0), goalMl: waterGoal };
        if (ratio >= 1) {
            note({
                id: "hydration",
                kind: "good",
                title: "Water on target",
                detail: `You averaged ${round(avg, 0)} ml a day against a ${waterGoal} ml goal.`,
                evidence,
            });
        } else if (ratio < HYDRATION_IMPROVE) {
            note({
                id: "hydration",
                kind: "improve",
                title: "Water is low",
                detail: `You averaged ${round(avg, 0)} ml a day against a ${waterGoal} ml goal.`,
                evidence,
            });
        }
    }

    // --- Logging consistency ---
    if (logged.length === windowDays) {
        note({
            id: "logging",
            kind: "good",
            title: "Logged every day",
            detail: `All ${windowDays} days have meals logged, so this review rests on a full week.`,
            evidence: { loggedDays: logged.length, windowDays },
        });
    } else if (logged.length <= windowDays - 2) {
        note({
            id: "logging",
            kind: "improve",
            title: "Some days are missing",
            detail: `${logged.length} of ${windowDays} days are logged, so the picture is partial.`,
            evidence: { loggedDays: logged.length, windowDays },
        });
    }

    // --- Score: weights rescaled over the components that have data ---
    const ids = Object.keys(COMPONENT_WEIGHTS) as ComponentId[];
    const available = ids.filter((id) => scores[id] != null);
    const totalWeight = available.reduce(
        (s, id) => s + COMPONENT_WEIGHTS[id],
        0,
    );
    const components: AdvisorComponent[] = ids.map((id) => {
        const score = scores[id] ?? null;
        return {
            id,
            label: COMPONENT_LABELS[id],
            weight: COMPONENT_WEIGHTS[id],
            score: score == null ? null : round(score, 2),
            points:
                score == null || totalWeight === 0
                    ? 0
                    : round(
                          (score * COMPONENT_WEIGHTS[id] * 100) / totalWeight,
                      ),
        };
    });
    const score =
        available.length === 0
            ? null
            : Math.round(components.reduce((s, c) => s + c.points, 0));

    return {
        ...base,
        enoughData: true,
        score,
        verdict: score == null ? null : verdictFor(score),
        components,
        findings,
        advice: null,
    };
}

/** Model-facing text for the MCP tool. */
export function formatAdvisorText(report: AdvisorReport): string {
    const head = `Eating review — ${report.window.start} to ${report.window.end} (${report.loggedDays} of ${report.windowDays} days logged)`;
    if (!report.enoughData) {
        return [head, ...report.findings.map((f) => f.detail)].join("\n\n");
    }
    const lines = [
        head,
        report.score == null
            ? "No score: no goal or data to judge against."
            : `Score: ${report.score}/100 — ${report.verdict}`,
    ];
    const list = (kind: "good" | "improve", label: string) => {
        const items = report.findings.filter((f) => f.kind === kind);
        if (items.length === 0) return;
        lines.push(
            [label, ...items.map((f) => `  • ${f.title}: ${f.detail}`)].join(
                "\n",
            ),
        );
    };
    list("good", "Went well:");
    list("improve", "To improve:");
    lines.push(
        "These are estimates from logged data, not medical or dietary advice.",
    );
    return lines.join("\n\n");
}
