// The dashboard's self-hosted font route (createDashboardRouter). No
// mock.module here: it is process-wide (see CLAUDE.md), and the route needs
// none — it never touches Supabase.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createDashboardRouter, DASHBOARD_FONTS } from "./dashboard.js";

const DIR = "public/dashboard-fonts";

describe("dashboard font route", () => {
    const app = createDashboardRouter();

    test("allowlist holds the three families", () => {
        expect([...DASHBOARD_FONTS].sort()).toEqual([
            "bricolage-grotesque-latin-v9.woff2",
            "geist-mono-latin-v6.woff2",
            "instrument-sans-latin-v4.woff2",
        ]);
    });

    for (const file of DASHBOARD_FONTS)
        test(`serves ${file} without auth, as immutable font/woff2`, async () => {
            const res = await app.request(`/dashboard-fonts/${file}`);
            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toBe("font/woff2");
            expect(res.headers.get("cache-control")).toContain("immutable");
            const body = new Uint8Array(await res.arrayBuffer());
            expect(body.byteLength).toBe(Bun.file(`${DIR}/${file}`).size);
            expect(new TextDecoder().decode(body.slice(0, 4))).toBe("wOF2");
        });

    for (const path of [
        "/dashboard-fonts/unknown.woff2",
        "/dashboard-fonts/..%2Fdashboard.html",
        "/dashboard-fonts/OFL-GeistMono.txt",
    ])
        test(`404 for ${path}`, async () => {
            const res = await app.request(path);
            expect(res.status).toBe(404);
        });

    test("every font ships its OFL licence beside it", () => {
        const files = readdirSync(DIR);
        for (const name of [
            "OFL-BricolageGrotesque.txt",
            "OFL-InstrumentSans.txt",
            "OFL-GeistMono.txt",
        ]) {
            expect(files).toContain(name);
            const text = readFileSync(`${DIR}/${name}`, "utf8");
            expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
        }
        for (const f of DASHBOARD_FONTS) expect(files).toContain(f);
    });
});
