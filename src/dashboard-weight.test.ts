// checkWeightPatch: the pure validator behind PATCH /api/dashboard/weights/:id.
// No mock.module here on purpose (see CLAUDE.md): the rules are pure.
import { test, expect, describe } from "bun:test";
import { checkWeightPatch } from "./dashboard.js";

describe("checkWeightPatch (Weigh-ins tab edit)", () => {
    const opts = {
        tz: "America/New_York",
        preferredUnit: "kg" as const,
        nowMs: Date.parse("2026-10-21T12:00:00Z"),
    };

    test("only the sent fields come back; weight becomes grams, time resolves in the profile zone", () => {
        expect(checkWeightPatch({ weight: "82.5" }, opts)).toEqual({
            ok: true,
            value: { weight_g: 82_500 },
        });
        expect(checkWeightPatch({ weight: 180, unit: "lb" }, opts)).toEqual({
            ok: true,
            value: { weight_g: 81_647 },
        });
        expect(
            checkWeightPatch({ logged_at: "2026-10-20T07:30" }, opts),
        ).toEqual({
            ok: true,
            value: { logged_at: "2026-10-20T11:30:00.000Z" },
        });
    });

    test("an empty note clears it; a note is trimmed", () => {
        expect(checkWeightPatch({ notes: "  " }, opts)).toEqual({
            ok: true,
            value: { notes: null },
        });
        expect(checkWeightPatch({ notes: " fasted " }, opts)).toEqual({
            ok: true,
            value: { notes: "fasted" },
        });
    });

    test("implausible, future, unknown-key and empty edits are refused", () => {
        for (const input of [
            { weight: 5 },
            { weight: "abc" },
            { weight: 80, unit: "stone" },
            { logged_at: "2099-01-01T08:00" },
            { logged_at: "" },
            { notes: 5 },
            { id: "x" },
            {},
        ])
            expect(checkWeightPatch(input, opts).ok).toBe(false);
    });
});
