// Health-app-style de-duplication of Active Energy samples, server-side.
//
// Shortcuts' "Find Health Samples" returns the raw samples of every source;
// it does not apply Health's source-priority merge, so summing them double-
// counts a Garmin and an iPhone that were both recording. Doing the merge in
// the Shortcut took 50+ fragile actions (and Garmin only syncs into Health
// when the Connect app is opened, so past days must be recomputed too). The
// Shortcut instead posts every sample of the last few days as one line each,
// `source|start|end|kcal`, and this module rebuilds each day's total.
//
// The rule mirrors Health: at any moment, the highest-ranked source with a
// sample covering it wins. A lower-ranked sample counts only for the share of
// its duration that no higher-ranked sample covers. Garmin writes a few long
// blocks (a whole day, or before/during/after a workout) and leaves the time
// after its last sync uncovered, so the iPhone fills exactly that gap.
//
// Pure: no Supabase, so it unit-tests with fixtures.

import { dateInTz } from "./tz.js";

export interface HealthSample {
    source: string;
    start: Date;
    end: Date;
    kcal: number;
}

/** Lower is preferred. Garmin over a Watch over the phone over any other app
 *  (Zwift and friends mostly re-record a workout a wearable already has). */
export function sourceRank(source: string): number {
    if (/garmin|connect/i.test(source)) return 0;
    if (/watch/i.test(source)) return 1;
    if (/iphone/i.test(source)) return 2;
    return 3;
}

/** "29.4", "29.4 kcal", "1,498", "1,498.2" — Shortcuts renders a Health value
 *  as locale text. A comma followed by exactly three digits is a thousands
 *  separator; any other single comma is a decimal one. */
export function parseKcal(raw: string): number | null {
    let s = raw.replace(/[^\d.,-]/g, "");
    if (s.includes(".")) s = s.replace(/,/g, "");
    else if (/,\d{3}(?!\d)/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
    const n = Number(s);
    return s !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** ISO 8601 ("2026-11-18T16:30:00-08:00"), or the export's
 *  "2026-11-18 16:30:00 -0800". Anything without an offset is refused: a
 *  wall clock alone would be read in the server's zone. */
export function parseInstant(raw: string): Date | null {
    const s = raw.trim();
    const m = s.match(
        /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})$/,
    );
    if (!m) return null;
    const off =
        m[3] === "Z"
            ? "Z"
            : (m[3] ?? "").replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(`${m[1]}T${m[2]}${off}`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function parseSampleLines(text: string): {
    samples: HealthSample[];
    rejected: number;
} {
    const samples: HealthSample[] = [];
    let rejected = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const parts = line.split("|");
        if (parts.length !== 4) {
            rejected++;
            continue;
        }
        const [source, s, e, v] = parts as [string, string, string, string];
        const start = parseInstant(s);
        const end = parseInstant(e);
        const kcal = parseKcal(v);
        if (!source.trim() || !start || !end || kcal == null || end < start) {
            rejected++;
            continue;
        }
        samples.push({ source: source.trim(), start, end, kcal });
    }
    return { samples, rejected };
}

type Span = [number, number];

function union(spans: Span[]): Span[] {
    const sorted = [...spans].sort((a, b) => a[0] - b[0]);
    const out: Span[] = [];
    for (const [a, b] of sorted) {
        const last = out[out.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

/** Share of [a, b] covered by `spans` (a disjoint, sorted union). A zero-length
 *  sample is covered when its instant falls inside a span. */
function coveredShare(a: number, b: number, spans: Span[]): number {
    if (b === a) return spans.some(([x, y]) => a >= x && a < y) ? 1 : 0;
    let cov = 0;
    for (const [x, y] of spans) {
        const o = Math.min(b, y) - Math.max(a, x);
        if (o > 0) cov += o;
    }
    return Math.min(1, cov / (b - a));
}

export interface MergedDay {
    date: string;
    kcal: number;
    /** What each source contributed after de-duplication, for display. */
    bySource: Record<string, number>;
}

/** One total per local day (the sample's start date in `tz`), oldest first. */
export function mergeByDay(samples: HealthSample[], tz: string): MergedDay[] {
    const ranked = samples.map((s) => ({ ...s, rank: sourceRank(s.source) }));
    const higher = new Map<number, Span[]>();
    for (const r of new Set(ranked.map((s) => s.rank))) {
        higher.set(
            r,
            union(
                ranked
                    .filter((s) => s.rank < r)
                    .map((s) => [s.start.getTime(), s.end.getTime()] as Span),
            ),
        );
    }
    const days = new Map<string, MergedDay>();
    for (const s of ranked) {
        const share =
            1 -
            coveredShare(
                s.start.getTime(),
                s.end.getTime(),
                higher.get(s.rank)!,
            );
        const kcal = s.kcal * share;
        const date = dateInTz(s.start, tz);
        const day = days.get(date) ?? { date, kcal: 0, bySource: {} };
        day.kcal += kcal;
        day.bySource[s.source] = (day.bySource[s.source] ?? 0) + kcal;
        days.set(date, day);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
