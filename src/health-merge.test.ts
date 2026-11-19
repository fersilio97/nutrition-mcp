import { describe, expect, test } from "bun:test";
import {
    mergeByDay,
    parseInstant,
    parseKcal,
    parseSampleLines,
    sourceRank,
    type HealthSample,
} from "./health-merge.js";

const TZ = "America/Los_Angeles";
const G = "Connect";
const P = "Fernando’s iPhone";
const s = (
    source: string,
    a: string,
    b: string,
    kcal: number,
): HealthSample => ({
    source,
    start: new Date(`${a}-08:00`),
    end: new Date(`${b}-08:00`),
    kcal,
});

describe("mergeByDay, all_day (Health's rule)", () => {
    test("Garmin covering the whole day wins over every iPhone sample", () => {
        // 2026-11-13 shape: before / run / after blocks, iPhone recorded the run too.
        const day = mergeByDay(
            [
                s(G, "2026-11-13T00:00:00", "2026-11-13T17:47:00", 24.3),
                s(G, "2026-11-13T17:47:00", "2026-11-13T18:19:00", 326),
                s(G, "2026-11-13T18:19:00", "2026-11-13T23:59:00", 7.7),
                s(P, "2026-11-13T17:42:00", "2026-11-13T17:52:00", 65),
                s(P, "2026-11-13T17:52:00", "2026-11-13T18:01:00", 95.7),
            ],
            TZ,
            "all_day",
        );
        expect(day).toHaveLength(1);
        expect(Math.round(day[0]!.kcal)).toBe(358);
        expect(Math.round(day[0]!.bySource[P] ?? -1)).toBe(0);
    });

    test("iPhone fills the time after Garmin's last sync", () => {
        // 2026-11-15 shape: Garmin stops at 10:04 (not synced since).
        const [day] = mergeByDay(
            [
                s(G, "2026-11-15T00:00:00", "2026-11-15T08:31:00", 10.9),
                s(G, "2026-11-15T08:31:00", "2026-11-15T10:01:00", 323),
                s(G, "2026-11-15T10:01:00", "2026-11-15T10:04:00", 0.1),
                s(P, "2026-11-15T09:52:00", "2026-11-15T10:00:00", 8.3),
                s(P, "2026-11-15T15:57:00", "2026-11-15T16:07:00", 7),
                s(P, "2026-11-15T17:27:00", "2026-11-15T17:36:00", 15.6),
            ],
            TZ,
            "all_day",
        );
        expect(Math.round(day!.kcal)).toBe(Math.round(334 + 7 + 15.6));
    });

    test("iPhone fills the morning when Garmin starts late, and a straddling sample is prorated", () => {
        // 2026-02-11 shape: Garmin's first block starts 19:05.
        const [day] = mergeByDay(
            [
                s(G, "2026-02-11T19:05:00", "2026-02-11T23:59:00", 352),
                s(P, "2026-02-11T09:00:00", "2026-02-11T09:10:00", 100),
                s(P, "2026-02-11T19:00:00", "2026-02-11T19:10:00", 10), // half covered
            ],
            TZ,
            "all_day",
        );
        expect(day!.kcal).toBeCloseTo(352 + 100 + 5, 5);
    });

    test("no Garmin at all is just the iPhone sum", () => {
        const [day] = mergeByDay(
            [
                s(P, "2026-11-18T08:00:00", "2026-11-18T08:10:00", 12),
                s(P, "2026-11-18T12:00:00", "2026-11-18T12:10:00", 17),
            ],
            TZ,
            "all_day",
        );
        expect(day!.kcal).toBe(29);
    });

    test("buckets by local day and sorts oldest first", () => {
        const days = mergeByDay(
            [
                s(P, "2026-11-18T23:30:00", "2026-11-18T23:40:00", 5),
                s(P, "2026-11-17T23:30:00", "2026-11-17T23:40:00", 3),
            ],
            TZ,
            "all_day",
        );
        expect(days.map((d) => d.date)).toEqual(["2026-11-17", "2026-11-18"]);
    });

    test("another app recording the same ride as Garmin adds nothing", () => {
        const [day] = mergeByDay(
            [
                s(G, "2026-05-28T00:00:00", "2026-05-28T23:59:00", 800),
                s("Zwift", "2026-05-28T07:00:00", "2026-05-28T08:00:00", 600),
            ],
            TZ,
            "all_day",
        );
        expect(day!.kcal).toBe(800);
    });
});

describe("mergeByDay, workouts (default)", () => {
    // 2026-11-13 shape again: watch worn only for the run.
    const day13 = [
        s(G, "2026-11-13T00:00:00", "2026-11-13T17:47:00", 24.3),
        s(G, "2026-11-13T17:47:00", "2026-11-13T18:19:00", 326),
        s(G, "2026-11-13T18:19:00", "2026-11-13T23:59:00", 7.7),
        s(P, "2026-11-13T09:00:00", "2026-11-13T09:10:00", 40),
        s(P, "2026-11-13T17:42:00", "2026-11-13T17:52:00", 65),
        s(P, "2026-11-13T17:52:00", "2026-11-13T18:01:00", 95.7),
        s(P, "2026-11-13T20:00:00", "2026-11-13T20:10:00", 30),
    ];

    test("Garmin's padding blocks no longer hide the iPhone's walking", () => {
        const [day] = mergeByDay(day13, TZ);
        // run 326 + walks 40 + 30 + the 5 pre-run minutes of the straddling
        // sample (65 x 5/10); the filler blocks are dropped.
        expect(day!.kcal).toBeCloseTo(326 + 40 + 30 + 32.5, 5);
        expect(mergeByDay(day13, TZ, "all_day")[0]!.kcal).toBeCloseTo(358, 5);
    });

    test("the default is workouts", () => {
        expect(mergeByDay(day13, TZ)[0]!.kcal).toBe(
            mergeByDay(day13, TZ, "workouts")[0]!.kcal,
        );
    });

    test("a no-workout day's 24 h Garmin block yields to the iPhone", () => {
        const [day] = mergeByDay(
            [
                s(G, "2026-11-10T00:00:00", "2026-11-10T23:59:00", 252),
                s(P, "2026-11-10T12:00:00", "2026-11-10T13:00:00", 150),
            ],
            TZ,
        );
        expect(day!.kcal).toBe(150);
    });

    test("filler still counts on a day the phone recorded nothing", () => {
        const [day] = mergeByDay(
            [
                s(G, "2026-11-10T00:00:00", "2026-11-10T08:00:00", 10),
                s(G, "2026-11-10T08:00:00", "2026-11-10T09:00:00", 300),
                s(G, "2026-11-10T09:00:00", "2026-11-10T23:59:00", 20),
            ],
            TZ,
        );
        expect(day!.kcal).toBe(330);
    });

    test("an Apple Watch is not demoted, whatever its rate", () => {
        const W = "Fernando’s Apple Watch";
        const [day] = mergeByDay(
            [
                s(W, "2026-11-10T00:00:00", "2026-11-10T23:59:00", 100),
                s(P, "2026-11-10T12:00:00", "2026-11-10T13:00:00", 150),
            ],
            TZ,
        );
        expect(day!.kcal).toBe(100);
    });
});

describe("parsing", () => {
    test("source ranks", () => {
        expect(sourceRank("Connect")).toBeLessThan(
            sourceRank("Fernando’s Apple Watch"),
        );
        expect(sourceRank("Fernando’s Apple Watch")).toBeLessThan(
            sourceRank(P),
        );
        expect(sourceRank(P)).toBeLessThan(sourceRank("Zwift"));
    });

    test("kcal text in Shortcuts' renderings", () => {
        expect(parseKcal("29.4")).toBe(29.4);
        expect(parseKcal("29.4 kcal")).toBe(29.4);
        expect(parseKcal("1,498")).toBe(1498);
        expect(parseKcal("1,498.2")).toBe(1498.2);
        expect(parseKcal("0,5")).toBe(0.5);
        expect(parseKcal("")).toBeNull();
        expect(parseKcal("-3")).toBeNull();
    });

    test("instants need an offset", () => {
        expect(parseInstant("2026-11-18T16:30:00-08:00")?.toISOString()).toBe(
            "2026-11-19T00:30:00.000Z",
        );
        expect(parseInstant("2026-11-18 16:30:00 -0800")?.toISOString()).toBe(
            "2026-11-19T00:30:00.000Z",
        );
        expect(parseInstant("2026-11-18T16:30:00Z")?.toISOString()).toBe(
            "2026-11-18T16:30:00.000Z",
        );
        expect(parseInstant("2026-11-18T16:30:00")).toBeNull();
        expect(parseInstant("Nov 18, 2026 at 4:30 PM")).toBeNull();
    });

    test("lines: good ones kept, malformed ones counted", () => {
        const { samples, rejected } = parseSampleLines(
            [
                `${P}|2026-11-18T08:00:00-08:00|2026-11-18T08:10:00-08:00|12.5`,
                "",
                "garbage",
                `${P}|2026-11-18T08:10:00-08:00|2026-11-18T08:00:00-08:00|1`, // end before start
                `${G}|2026-11-18T00:00:00-08:00|2026-11-18T10:00:00-08:00|1,204`,
            ].join("\n"),
        );
        expect(samples.map((x) => x.kcal)).toEqual([12.5, 1204]);
        expect(rejected).toBe(2);
    });
});
