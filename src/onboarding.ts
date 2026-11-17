// First-run setup checklist (vault feature 006, UX audit 2026-11-16).
//
// One definition of "set up", shared by get_profile (which tells the model
// what is still missing so it can offer to finish) and the dashboard's Today
// card, so the two can never disagree about what is left. Pure: callers pass
// the rows they already read.

import type { NutritionGoals, Profile } from "./supabase.js";

export type SetupKey =
    "timezone" | "language" | "weight_unit" | "body" | "goal" | "activity";

export interface SetupItem {
    key: SetupKey;
    /** Short label for a checklist row. */
    label: string;
    /** What finishes it: the words to say to the assistant. */
    say: string;
    done: boolean;
}

export function setupChecklist(
    profile: Profile | null,
    goals: NutritionGoals | null,
    activityConnected: boolean,
): SetupItem[] {
    const bodyDone =
        profile?.height_cm != null &&
        profile?.birth_date != null &&
        profile?.sex != null;
    // Any goal row with a calorie figure or a chosen mode counts as a plan.
    const goalDone =
        goals != null &&
        (goals.calorie_goal_mode != null ||
            (goals.daily_calories != null && goals.daily_calories > 0));
    return [
        {
            key: "timezone",
            label: "Timezone",
            say: "“My timezone is Europe/Madrid”",
            done: profile?.timezone != null,
        },
        {
            key: "language",
            label: "Language",
            say: "“Show widgets in Spanish”",
            done: profile?.locale != null,
        },
        {
            key: "weight_unit",
            label: "Weight unit",
            say: "“I weigh myself in kg”",
            done: profile?.preferred_weight_unit != null,
        },
        {
            key: "body",
            label: "Height, birth date and sex",
            say: "“I'm 170 cm, born 1997-06-27, male”",
            done: bodyDone,
        },
        {
            key: "goal",
            label: "Calorie goal",
            say: "“Help me set a calorie goal”",
            done: goalDone,
        },
        {
            key: "activity",
            label: "Watch / Apple Health sync",
            say: "“Connect my Apple Health active calories”",
            done: activityConnected,
        },
    ];
}

/** get_profile's closing line, or "" once everything is done. */
export function setupLine(items: SetupItem[]): string {
    const missing = items.filter((i) => !i.done);
    if (missing.length === 0) return "";
    return `Setup not finished (${items.length - missing.length} of ${items.length} done): ${missing
        .map((i) => i.label.toLowerCase())
        .join(
            ", ",
        )}. Offer to finish these in one go — each is one sentence for the user.`;
}
