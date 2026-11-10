// End-to-end check of the personal dashboard against the dev preview
// (scripts/dashboard-preview.ts). Dev-only and NOT part of `bun test`: it
// needs a browser. Playwright and axe-core are not repo dependencies — install
// them anywhere outside the repo and point PW_DIR at that folder:
//
//   mkdir -p /tmp/dash-tools && (cd /tmp/dash-tools && bun add playwright axe-core \
//       && bunx playwright install chromium)
//   DASHBOARD_PREVIEW_PORT=8793 bun scripts/dashboard-preview.ts &
//   PW_DIR=/tmp/dash-tools bun scripts/dashboard-e2e.ts http://localhost:8793
//
// Add SHOTS=docs/redesign/screenshots to also write the review screenshots.
// It changes the preview's in-memory scenario, so run it against its own
// preview instance, not the one you are looking at.

const base = process.argv[2] ?? "http://localhost:8793";
const PW_DIR = process.env.PW_DIR ?? "/tmp/dash-tools";
const SHOTS = process.env.SHOTS;
const { chromium } = require(`${PW_DIR}/node_modules/playwright`);
const AXE = await Bun.file(`${PW_DIR}/node_modules/axe-core/axe.min.js`).text();

let failures = 0;
const check = (ok: boolean, what: string) => {
    console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
    if (!ok) failures++;
};

const browser = await chromium.launch();

async function open(opts: {
    width: number;
    theme?: "light" | "dark";
    query?: string;
    hash?: string;
    touch?: boolean;
    tz?: string;
}) {
    const ctx = await browser.newContext({
        viewport: { width: opts.width, height: opts.width < 500 ? 844 : 900 },
        colorScheme: opts.theme ?? "light",
        hasTouch: !!opts.touch,
        isMobile: !!opts.touch,
        timezoneId: opts.tz ?? "America/Los_Angeles",
    });
    const page = await ctx.newPage();
    const problems: string[] = [];
    page.on("console", (m: any) => {
        if (m.type() === "error" || m.type() === "warning")
            problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e: any) => problems.push(`pageerror: ${e}`));
    page.on("request", (r: any) => {
        if (new URL(r.url()).origin !== new URL(base).origin)
            problems.push(`foreign request: ${r.url()}`);
    });
    await page.goto(
        `${base}/dashboard${opts.query ?? "?scenario=full"}${opts.hash ?? ""}`,
    );
    return { ctx, page, problems };
}

async function login(page: any, email = "me@test") {
    await page.fill("#email", email);
    await page.fill("#password", "pw");
    await page.click("#login-btn");
}
const settled = (page: any) =>
    page.waitForFunction(
        // Only the visible panel paints; a hidden one may still hold its
        // first-load skeleton until it is opened.
        () =>
            !document.querySelector("[role=tabpanel]:not([hidden]) .skel") &&
            !document.querySelector(".refreshing"),
        null,
        { timeout: 15000 },
    );

async function axe(page: any, label: string) {
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(async () => {
        // @ts-ignore injected
        const r = await axe.run(document, {
            resultTypes: ["violations"],
        });
        return r.violations
            .filter(
                (v: any) => v.impact === "serious" || v.impact === "critical",
            )
            .map((v: any) => `${v.id} (${v.nodes.length})`);
    });
    check(
        res.length === 0,
        `axe ${label}: ${res.join(", ") || "no serious/critical"}`,
    );
}

const TABS = ["today", "trends", "body", "meals"];

// ---------- login states ----------
console.log("login");
{
    const { ctx, page, problems } = await open({ width: 390 });
    await login(page, "bad@test");
    await page.waitForFunction(
        () => document.querySelector("#login-err")!.textContent,
    );
    check(
        (await page.textContent("#login-err")) ===
            "Email or password is incorrect.",
        "401 shows the credentials message",
    );
    await login(page, "429@test");
    await page.waitForFunction(() =>
        document
            .querySelector("#login-err")!
            .textContent!.startsWith("Too many"),
    );
    check(true, "429 shows the rate-limit message");
    // The two failed logins log 401/429 resource errors by design.
    check(
        problems.filter((p) => !/status of 40[19]|status of 429/.test(p))
            .length === 0,
        "no unexpected console problems on login page",
    );
    await ctx.close();
}

// ---------- the full walk, both widths and themes ----------
for (const theme of ["light", "dark"] as const)
    for (const width of [390, 1440]) {
        console.log(`full · ${width}px · ${theme}`);
        const { ctx, page, problems } = await open({ width, theme });
        if (SHOTS)
            await page.screenshot({
                path: `${SHOTS}/login-${width}-${theme}.png`,
            });
        await login(page);
        await settled(page);
        check(
            await page.evaluate(
                () => document.activeElement?.id === "tab-today",
            ),
            "sign-in focuses the Today tab",
        );
        for (const t of TABS) {
            await page.click(`#tab-${t}`);
            await settled(page);
            await page.waitForTimeout(250);
            const sel = await page.getAttribute(`#tab-${t}`, "aria-selected");
            check(
                sel === "true" && page.url().endsWith(`#${t}`),
                `${t}: selected, hash set`,
            );
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
            );
            check(overflow <= 0, `${t}: no horizontal scroll (${overflow})`);
            const minFont = await page.evaluate((tab: string) => {
                const sizes = [
                    ...document.querySelectorAll(
                        `#panel-${tab} svg.chart text`,
                    ),
                ].map((e) => {
                    const svg = (e as SVGElement).ownerSVGElement!;
                    const scale =
                        svg.getBoundingClientRect().width /
                        (svg.viewBox.baseVal.width || 1);
                    return parseFloat(getComputedStyle(e).fontSize) * scale;
                });
                return sizes.length ? Math.min(...sizes) : null;
            }, t);
            if (minFont != null)
                check(
                    minFont >= 11.99,
                    `${t}: chart text ≥ 12px (${minFont.toFixed(1)})`,
                );
            if (SHOTS)
                await page.screenshot({
                    path: `${SHOTS}/${t}-${width}-${theme}.png`,
                    fullPage: true,
                });
            await axe(page, `${t} ${width} ${theme}`);
        }
        if (width === 390) {
            const inputs = await page.evaluate(() =>
                [...document.querySelectorAll("#panel-body .input")].map(
                    (e) => getComputedStyle(e).fontSize,
                ),
            );
            check(
                inputs.every((s: string) => s === "16px"),
                "Body inputs are 16px on mobile",
            );
            await page.click("#tab-meals");
            const cards = await page.evaluate(
                () =>
                    getComputedStyle(
                        document.querySelector(".meals-table tr.meal")!,
                    ).display,
            );
            check(cards === "flex", "meals render as cards at 390px");
        }
        // Range: every segment, then back to 30.
        await page.click("#tab-trends");
        for (const d of [7, 365, 30]) {
            await page.click(`#panel-trends .seg button[data-days="${d}"]`);
            await settled(page);
            const days = await page.evaluate(
                () =>
                    document.querySelector("#panel-trends .range-label small")!
                        .textContent,
            );
            check(!!days && days.length > 0, `range ${d}: rendered (${days})`);
        }
        // Keyboard inspect on the calories chart.
        await page.focus("#cal-plot svg");
        await page.keyboard.press("End");
        const liveText = await page.textContent("#live");
        check(
            !!liveText && /Eaten/.test(liveText),
            "chart keyboard stepping announces a day",
        );
        await page.keyboard.press("Escape");
        // Back / forward between tabs.
        await page.click("#tab-body");
        await page.goBack();
        await page.waitForTimeout(150);
        check(
            (await page.getAttribute("#tab-trends", "aria-selected")) ===
                "true",
            "back returns to the previous tab",
        );
        await page.goForward();
        await page.waitForTimeout(150);
        check(
            (await page.getAttribute("#tab-body", "aria-selected")) === "true",
            "forward goes to the next tab",
        );
        check(
            problems.length === 0,
            `console/network clean: ${problems.join(" | ") || "none"}`,
        );
        await ctx.close();
    }

// ---------- theme: toggle both ways, no flash, icon follows ----------
console.log("theme");
{
    const { ctx, page, problems } = await open({ width: 390, theme: "dark" });
    const icon = () =>
        page.evaluate(() => ({
            sun: !document
                .querySelector("#theme-btn .i-sun")!
                .hasAttribute("hidden"),
            moon: !document
                .querySelector("#theme-btn .i-moon")!
                .hasAttribute("hidden"),
            label: document
                .getElementById("theme-btn")!
                .getAttribute("aria-label"),
            bg: getComputedStyle(document.body).backgroundColor,
        }));
    await login(page);
    await settled(page);
    let s = await icon();
    check(
        s.sun && !s.moon && s.label === "Switch to light theme",
        "system dark: sun icon, 'Switch to light theme'",
    );
    await page.click("#theme-btn");
    s = await icon();
    check(
        !s.sun && s.moon && s.bg === "rgb(243, 247, 244)",
        "toggle wins over a dark system theme (light --bg)",
    );
    await page.click("#theme-btn");
    s = await icon();
    check(
        s.sun && s.bg === "rgb(10, 19, 16)",
        "toggle back to dark (forest --bg)",
    );
    // Reload with the saved dark choice in a LIGHT system: the pre-paint
    // script must apply it before the body is first styled.
    const ctx2 = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
    });
    const p2 = await ctx2.newPage();
    await p2.addInitScript(() => {
        try {
            localStorage.setItem("nutrition-dash-theme", "dark");
        } catch (e) {}
        document.addEventListener("DOMContentLoaded", () => {
            (window as any).__firstBg = getComputedStyle(
                document.body,
            ).backgroundColor;
        });
    });
    await p2.goto(`${base}/dashboard`);
    const firstBg = await p2.evaluate(() => (window as any).__firstBg);
    check(
        firstBg === "rgb(10, 19, 16)",
        `saved dark theme applies before first paint (${firstBg})`,
    );
    await ctx2.close();
    check(
        problems.length === 0,
        `console/network clean: ${problems.join(" | ") || "none"}`,
    );
    await ctx.close();
}

// ---------- touch: tap pins a tooltip ----------
console.log("touch");
{
    const { ctx, page, problems } = await open({
        width: 390,
        touch: true,
        hash: "#trends",
    });
    await login(page);
    await settled(page);
    await page.click("#tab-trends");
    // A tap can only land on what is on screen; the chart may sit below
    // the fold at 844px. Let the scroll settle (scroll dismisses tips).
    await page.locator("#cal-plot svg").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await page.locator("#cal-plot svg").boundingBox();
    await page.touchscreen.tap(
        box.x + box.width * 0.6,
        box.y + box.height * 0.5,
    );
    await page.waitForTimeout(200);
    const tip = await page.evaluate(() => {
        const t = document.getElementById("tip")!;
        const r = t.getBoundingClientRect();
        return { shown: !t.hidden, left: r.left, right: r.right };
    });
    check(tip.shown, "tap pins the tooltip");
    check(
        tip.left >= 0 && tip.right <= 390,
        "pinned tooltip stays inside 390px",
    );
    await page.touchscreen.tap(20, 20);
    await page.waitForTimeout(150);
    check(
        await page.evaluate(() => document.getElementById("tip")!.hidden),
        "tapping elsewhere dismisses it",
    );
    check(
        problems.length === 0,
        `console/network clean: ${problems.join(" | ") || "none"}`,
    );
    await ctx.close();
}

// ---------- deep link, persistence, body save, sign out ----------
console.log("deep link + body form");
{
    const { ctx, page, problems } = await open({
        width: 1440,
        query: "?scenario=no-body",
        hash: "#body",
    });
    await login(page);
    await settled(page);
    check(
        (await page.getAttribute("#tab-body", "aria-selected")) === "true",
        "#body on load opens Body",
    );
    check(
        await page.evaluate(
            () =>
                (document.getElementById("body-box") as HTMLDetailsElement)
                    .open,
        ),
        "form auto-opens when details are missing",
    );
    await page.fill("#b-height", "178");
    await page.fill("#b-birth", "1990-05-14");
    await page.selectOption("#b-sex", "male");
    const reqP = page.waitForRequest((r: any) =>
        r.url().endsWith("/api/dashboard/body"),
    );
    await page.click("#b-save");
    const req = await reqP;
    const sent = JSON.parse(req.postData());
    check(
        sent.height === 178 &&
            sent.height_unit === "cm" &&
            sent.birth_date === "1990-05-14" &&
            sent.sex === "male",
        `body payload ${JSON.stringify(sent)}`,
    );
    await page.waitForFunction(
        () => document.querySelector("#b-status")?.textContent === "Saved.",
    );
    await settled(page);
    check(
        !(await page.evaluate(
            () => !!document.querySelector("#panel-body .notice"),
        )),
        "after save, the missing-details notice is gone",
    );
    // Range persists across reloads.
    await page.click("#tab-meals");
    await page.click('#panel-meals .seg button[data-days="7"]');
    await settled(page);
    await page.reload();
    await settled(page);
    check(
        (await page.getAttribute(
            '#panel-meals .seg button[data-days="7"]',
            "aria-pressed",
        )) === "true",
        "range persists across reloads",
    );
    await page.click('#panel-meals .seg button[data-days="30"]');
    await settled(page);
    await page.click("#signout");
    check(
        await page.evaluate(
            () =>
                !document.getElementById("login")!.hidden &&
                document.activeElement?.id === "email",
        ),
        "sign out returns to login and focuses email",
    );
    check(
        problems.length === 0,
        `console/network clean: ${problems.join(" | ") || "none"}`,
    );
    await ctx.close();
}

// ---------- feedback round 1: burn split, 7-day pair, writes ----------
// Chrome logs every 4xx response as a console error; the deliberate bad
// submissions below produce exactly those, so only those are excused.
const unexpected = (problems: string[]) =>
    problems.filter((p) => !/status of 400 \(Bad Request\)/.test(p));
for (const width of [390, 1440]) {
    console.log(`round 1 · ${width}px`);
    const { ctx, page, problems } = await open({ width });
    await login(page);
    await settled(page);

    // Today: the two fixed 7-day figures.
    const pair = await page.evaluate(
        () =>
            document.querySelector("#today-body .trio.two")?.textContent || "",
    );
    check(
        /Scale/.test(pair) && /Net est\. change/.test(pair) && /g/.test(pair),
        "Today shows the 7-day scale + net estimate pair",
    );

    // Trends: resting + workout in legend and tooltip.
    await page.click("#tab-trends");
    await settled(page);
    const legendText = await page.textContent("#panel-trends .legend");
    check(
        /Resting burn \(changes with weight\)/.test(legendText) &&
            /Workout \/ active/.test(legendText),
        "Calories legend names resting burn and workout / active",
    );
    check(
        (await page.locator("#cal-plot .m-rest").count()) === 1 &&
            (await page.locator("#cal-plot .m-active").count()) > 0,
        "Calories chart draws the resting line and active segments",
    );
    await page.focus("#cal-plot svg");
    await page.keyboard.press("Home");
    let tipText = "";
    for (let i = 0; i < 30 && !/Active/.test(tipText); i++) {
        tipText = (await page.textContent("#live")) || "";
        if (!/Active/.test(tipText)) await page.keyboard.press("ArrowRight");
    }
    check(
        /Resting/.test(tipText) &&
            /Active/.test(tipText) &&
            /Est\. burn total/.test(tipText),
        "tooltip lists Resting, Active and Est. burn total",
    );
    await page.keyboard.press("Escape");

    // Body: log a weigh-in — inline error, then a real save.
    await page.click("#tab-body");
    await settled(page);
    await page.click("#lw-open");
    await page.fill("#lw-weight", "3");
    await page.click("#lw-save");
    await page.waitForFunction(() =>
        /outside/.test(document.querySelector("#lw-status")?.textContent || ""),
    );
    check(true, "Log weight: an implausible weight is refused inline");
    await page.fill("#lw-weight", "80.4");
    await page.fill("#lw-note", "e2e");
    const wReq = page.waitForRequest((r: any) =>
        r.url().endsWith("/api/dashboard/weight"),
    );
    await page.click("#lw-save");
    const wBody = JSON.parse((await wReq).postData());
    check(
        wBody.weight === 80.4 &&
            wBody.unit === "kg" &&
            /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(wBody.logged_at) &&
            wBody.notes === "e2e",
        `Log weight payload ${JSON.stringify(wBody)}`,
    );
    await page.waitForSelector(".lw-flash");
    await settled(page);
    check(
        (await page.textContent(".w-now b"))!.trim() === "80.4",
        "the new weigh-in becomes the current weight",
    );

    // Meals: edit one — bounds error, then only the changed fields.
    await page.click("#tab-meals");
    await settled(page);
    await page.locator("#meals-body .btn-edit").first().click();
    check(
        (await page.locator('#me-type option[value="treat"]').textContent()) ===
            "Treat",
        "meal editor offers Treat",
    );
    await page.fill("#me-calories", "25000");
    await page.click("#me-save");
    await page.waitForFunction(() =>
        /must be/.test(document.querySelector("#me-status")?.textContent || ""),
    );
    check(true, "Edit meal: update_meal's bound is enforced inline");
    await page.fill("#me-calories", "432");
    const mReq = page.waitForRequest((r: any) => r.method() === "PATCH");
    await page.click("#me-save");
    const mBody = JSON.parse((await mReq).postData());
    check(
        JSON.stringify(mBody) === '{"calories":432}',
        `Edit meal sends only the change: ${JSON.stringify(mBody)}`,
    );
    await page.waitForSelector(".meal-flash");
    await settled(page);
    check(
        await page.evaluate(() =>
            [...document.querySelectorAll("#meals-body td.k")].some(
                (e) => e.textContent!.trim() === "432",
            ),
        ),
        "the edited meal shows its new kcal",
    );
    check(
        (await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
        )) <= 0,
        "no horizontal scroll with the editor used",
    );
    if (SHOTS) {
        await page.locator("#meals-body .btn-edit").first().click();
        await page.waitForSelector("#me-form");
        await page.screenshot({
            path: `${SHOTS}/meals-edit-${width}-light.png`,
            fullPage: false,
        });
        await page.click("#me-cancel");
    }
    await axe(page, `meals with editor ${width}`);
    const bad = unexpected(problems);
    check(
        bad.length === 0,
        `console/network clean: ${bad.join(" | ") || "none"}`,
    );
    await ctx.close();
}
// Reset the preview's in-memory writes.
{
    const { ctx } = await open({ width: 390, query: "?scenario=full" });
    await ctx.close();
}

// ---------- every scenario: no console errors, no overflow ----------
for (const sc of [
    "over-goal",
    "no-body",
    "no-goals",
    "empty",
    "lb",
    "calibrate",
])
    for (const theme of ["light", "dark"] as const) {
        const { ctx, page, problems } = await open({
            width: 390,
            theme,
            query: `?scenario=${sc}`,
            tz: sc === "lb" ? "America/Los_Angeles" : undefined,
        });
        await login(page);
        await settled(page);
        let overflow = 0;
        for (const t of TABS) {
            await page.click(`#tab-${t}`);
            await settled(page);
            overflow = Math.max(
                overflow,
                await page.evaluate(
                    () => document.documentElement.scrollWidth - innerWidth,
                ),
            );
            if (sc === "empty") {
                // Let the 160ms panel fade-in finish: axe reads a
                // half-transparent panel as low contrast.
                await page.waitForTimeout(250);
                await axe(page, `empty ${t} ${theme}`);
            }
        }
        if (sc === "lb") {
            const tzOk = await page.evaluate(() => {
                const sub = document.getElementById("sub")!.textContent!;
                return sub.includes("Asia/Tokyo");
            });
            check(
                tzOk,
                "lb: header shows the profile zone (Asia/Tokyo) in a Los Angeles browser",
            );
            await page.click("#tab-today");
            const n = await page.evaluate(
                () =>
                    document.querySelectorAll("#today-body .meal-list li")
                        .length,
            );
            check(
                n === 2,
                `lb: today's meals filtered on the Tokyo day (${n})`,
            );
        }
        if (SHOTS && sc === "empty")
            for (const w of [390, 1440]) {
                await page.setViewportSize({
                    width: w,
                    height: w < 500 ? 844 : 900,
                });
                await page.click("#tab-today");
                await page.waitForTimeout(250);
                await page.screenshot({
                    path: `${SHOTS}/empty-today-${w}-${theme}.png`,
                    fullPage: true,
                });
            }
        check(
            overflow <= 0 && problems.length === 0,
            `${sc} ${theme}: clean (${problems.join(" | ") || "no problems"})`,
        );
        await ctx.close();
    }

// ---------- failure modes ----------
console.log("failure modes");
{
    const { ctx, page } = await open({ width: 390, query: "?delay=2000" });
    await login(page);
    await page.waitForTimeout(400);
    check(
        await page.evaluate(
            () => !!document.querySelector("#today-body .skel"),
        ),
        "delay shows skeletons",
    );
    await settled(page);
    await ctx.close();
}
{
    const { ctx, page } = await open({ width: 390, query: "?fail=500" });
    await login(page);
    await page.waitForSelector(".banner [data-retry]");
    check(true, "fail=500 shows the banner with Retry");
    await page.click(".banner [data-retry]");
    await page.waitForSelector(".banner [data-retry]");
    check(true, "Retry refetches (still failing, banner returns)");
    await ctx.close();
}
{
    const { ctx, page } = await open({ width: 390, query: "?fail=401" });
    await login(page);
    await page.waitForFunction(() => !document.getElementById("login")!.hidden);
    check(true, "fail=401 returns to login");
    await ctx.close();
}
// Leave the preview in its default state.
{
    const { ctx } = await open({ width: 390, query: "?scenario=full" });
    await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
