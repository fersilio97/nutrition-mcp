import {
    ADVISOR_DAYS,
    buildAdvisorReport,
    type AdvisorReport,
} from "./advisor.js";
import { buildDailyBuckets } from "./insights.js";
import {
    alcoholTrackingEnabledFromProfile,
    waterTrackingEnabledFromProfile,
    getLatestWeight,
    getMealsInRange,
    getNutritionGoals,
    getProfile,
    getWaterInRange,
    timezoneFromProfile,
} from "./supabase.js";
import { shiftLocalDate, todayInTz } from "./tz.js";

/**
 * Fetch what the review needs and build it. Shared by the dashboard route and
 * the MCP tool so the two cannot disagree. The window is the `ADVISOR_DAYS`
 * complete days ending `endDate` — yesterday by default, because today is
 * still being logged and would always read as under-eating.
 */
export async function loadAdvisorReport(
    userId: string,
    endDate?: string,
): Promise<AdvisorReport> {
    const profile = await getProfile(userId);
    const tz = timezoneFromProfile(profile) ?? "UTC";
    const end = endDate ?? shiftLocalDate(todayInTz(tz), -1);
    const start = shiftLocalDate(end, -(ADVISOR_DAYS - 1));

    const [meals, water, goals, latestWeight] = await Promise.all([
        getMealsInRange(userId, start, end, tz),
        getWaterInRange(userId, start, end, tz),
        getNutritionGoals(userId),
        getLatestWeight(userId),
    ]);

    return buildAdvisorReport(
        buildDailyBuckets(meals, water, start, end, tz),
        goals,
        {
            tz,
            weightKg: latestWeight ? latestWeight.weight_g / 1000 : null,
            alcoholEnabled: alcoholTrackingEnabledFromProfile(profile),
            waterEnabled: waterTrackingEnabledFromProfile(profile),
        },
    );
}
