// The installable dashboard (vault 011): manifest, icons, service worker and
// the page's wiring to them. No module mocks here — everything under test is
// pure or reads files under public/.
import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_APP_FILES,
    DASHBOARD_CSP,
    DASHBOARD_MANIFEST,
    dashboardAppAssetResponse,
} from "./dashboard.js";

const page = await Bun.file("./public/dashboard.html").text();
const sw = await Bun.file("./public/dashboard-sw.js").text();

/** PNG width/height from the IHDR chunk. */
async function pngSize(path: string): Promise<[number, number]> {
    const b = new DataView(await Bun.file(path).arrayBuffer());
    expect(b.getUint32(0)).toBe(0x89504e47);
    return [b.getUint32(16), b.getUint32(20)];
}

describe("dashboard manifest", () => {
    const m = DASHBOARD_MANIFEST;

    test("opens standalone on /dashboard, inside its own scope", () => {
        expect(m.display).toBe("standalone");
        expect(m.start_url.startsWith(m.scope)).toBe(true);
        expect(m.scope).toBe("/dashboard");
        expect(m.short_name.length).toBeLessThanOrEqual(12);
    });

    test("has a 192, a 512 and a maskable icon, each the size it claims", async () => {
        const sizes = m.icons.map((i) => i.sizes);
        expect(sizes).toContain("192x192");
        expect(sizes).toContain("512x512");
        expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
        for (const icon of m.icons) {
            const [w, h] = await pngSize("./public" + icon.src);
            expect(`${w}x${h}`).toBe(icon.sizes);
            // Every icon the manifest names is servable.
            expect(dashboardAppAssetResponse(icon.src)).not.toBeNull();
        }
    });

    test("splash colour is the page's light background token", () => {
        expect(page).toContain("--bg: " + m.background_color + ";");
    });

    test("is served as JSON with the manifest content type", async () => {
        const res = dashboardAppAssetResponse("/dashboard.webmanifest")!;
        expect(res.headers.get("Content-Type")).toBe(
            "application/manifest+json",
        );
        expect(await res.json()).toEqual(JSON.parse(JSON.stringify(m)));
    });
});

describe("dashboard app assets", () => {
    test("only allowlisted files are served", () => {
        for (const p of [
            "/dashboard-app/../../.env",
            "/dashboard-app/%2e%2e/.env",
            "/dashboard-app/",
            "/dashboard-app/icon-1024.png",
            "/dashboard-sw.js.map",
            "/sw.js",
        ])
            expect(dashboardAppAssetResponse(p)).toBeNull();
    });

    test("every allowlisted file exists", async () => {
        for (const f of DASHBOARD_APP_FILES.keys())
            expect(await Bun.file("./public/dashboard-app/" + f).exists()).toBe(
                true,
            );
    });

    test("the apple-touch-icon is 180 px", async () => {
        expect(
            await pngSize("./public/dashboard-app/apple-touch-icon.png"),
        ).toEqual([180, 180]);
    });

    test("the worker is served no-cache, as JavaScript", () => {
        const res = dashboardAppAssetResponse("/dashboard-sw.js")!;
        expect(res.headers.get("Cache-Control")).toBe("no-cache");
        expect(res.headers.get("Content-Type")).toContain("javascript");
    });

    test("the page CSP already allows all of it (falls back to 'self')", () => {
        expect(DASHBOARD_CSP).toContain("default-src 'self'");
        expect(DASHBOARD_CSP).not.toContain("worker-src");
        expect(DASHBOARD_CSP).not.toContain("manifest-src");
    });
});

describe("service worker", () => {
    test("is valid JavaScript", () => {
        expect(() => new Function(sw)).not.toThrow();
    });

    test("never handles /api or non-GET requests", () => {
        expect(sw).toContain('url.pathname.startsWith("/api/")) return;');
        expect(sw).toContain('if (req.method !== "GET") return;');
        expect(sw).toContain("url.origin !== self.location.origin");
    });

    test("fetches the page from the network first", () => {
        // The cached copy is only the .catch() fallback, so a deploy is
        // never hidden behind a stale shell.
        const nav = sw.slice(sw.indexOf('req.mode === "navigate"'));
        const net = nav.indexOf("fetch(req)");
        const cached = nav.indexOf('.match("/dashboard")');
        expect(net).toBeGreaterThan(0);
        expect(cached).toBeGreaterThan(net);
        expect(nav.slice(net, cached)).toContain(".catch(");
    });

    test("old caches are deleted on activation", () => {
        expect(sw).toContain("caches.delete(k)");
        expect(sw).toMatch(/const VERSION = "v\d+";/);
    });
});

describe("page wiring", () => {
    test("links the manifest, icons and theme colours", () => {
        expect(page).toContain(
            '<link rel="manifest" href="/dashboard.webmanifest" />',
        );
        expect(page).toContain('href="/dashboard-app/apple-touch-icon.png"');
        expect(page).toContain('name="apple-mobile-web-app-capable"');
        expect(page.match(/<meta\s+name="theme-color"/g)?.length).toBe(2);
    });

    test("registers the worker scoped to /dashboard", () => {
        expect(page).toContain(
            '.register("/dashboard-sw.js", { scope: "/dashboard" })',
        );
    });

    test("refetches when the installed app comes back to the foreground", () => {
        expect(page).toContain('addEventListener("visibilitychange"');
    });
});
