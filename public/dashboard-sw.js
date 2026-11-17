// Service worker for the installable dashboard (vault 011). Registered by
// public/dashboard.html with scope "/dashboard", so it only ever sees the
// page, its fonts and its icons. /api/*, /mcp and the public site are
// outside that scope and never reach this file.
//
// - The page: network first, every time. A deploy must show up on the
//   next open, so the cached copy is only a fallback for when there is no
//   network (the app then opens and says it is offline instead of showing a
//   browser error page).
// - Fonts and icons: cache first. Their names are versioned, so the bytes
//   behind a name never change.
// - Nothing else is cached, and personal data never is: the page fetches it
//   from /api/dashboard/*, outside this worker's scope, with a bearer token.
//
// Bump VERSION to drop every old cache on the next activation.
const VERSION = "v1";
const CACHE = "nutrition-dashboard-" + VERSION;
const STATIC = /^\/(dashboard-fonts|dashboard-app)\//;

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((c) => c.add("/dashboard"))
            .catch(() => {})
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k.startsWith("nutrition-dashboard-"))
                        .filter((k) => k !== CACHE)
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/")) return;

    if (req.mode === "navigate" && url.pathname === "/dashboard") {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches
                            .open(CACHE)
                            .then((c) => c.put("/dashboard", copy));
                    }
                    return res;
                })
                .catch(() =>
                    caches
                        .match("/dashboard")
                        .then((hit) => hit || Response.error()),
                ),
        );
        return;
    }

    if (STATIC.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then(
                (hit) =>
                    hit ||
                    fetch(req).then((res) => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(CACHE).then((c) => c.put(req, copy));
                        }
                        return res;
                    }),
            ),
        );
    }
});
