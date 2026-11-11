# Redesign brief: Personal nutrition dashboard (`/dashboard`), round 3 (visual re-skin)

> Written 2026-11-10 from the user's request and the code. Rounds 1–2 are archived under
> `docs/redesign/archive/round-2/` (BRIEF, REQUIREMENTS, IMPLEMENTATION_LOG, screenshots).
> **This round is a re-skin only** (user decision, 2026-11-10). It keeps every feature, tab,
> behaviour and decision in `archive/round-2/REQUIREMENTS.md` §0, §0b and §0c. The user's
> complaint: the dashboard looks generic and "shabby" next to https://nutrition.labucu.com/.
> The goal is to match that site's craft.

- **app_name / url:** nutrition-mcp personal dashboard. It is served at `GET /dashboard`
  by the Bun + Hono server when `DASHBOARD_ENABLED=true`. For this round, use the fixture
  preview at http://localhost:8791/dashboard (see `deploy`). Sign in with any email and
  password.
- **domain_and_users:** One user, the owner, views their own nutrition logs: meals,
  macros, calories against an activity-adjusted goal, estimated burn and kcal balance, and
  weight against target and BMI. They check it briefly, a few times a day, mostly on an
  iPhone and sometimes on a desktop. Logging happens through Claude via MCP. The
  dashboard writes only through the Body form, Log weight and inline meal edit.
- **mood:** The same family as the public site: the Nutrition Facts label's grammar,
  paper-white with green-black ink in light mode, forest-tinted (not grey) in dark mode,
  calm and precise, editorial rather than "SaaS card grid". Avoid: generic rounded cards on
  grey, equal visual weight everywhere, system-font look, neon, contrast-hurting gradients,
  and red/green as the only signal.
- **design_reference:** https://nutrition.labucu.com/. Local source of truth:
  `public/styles.css` (tokens at the top, dark values declared under
  `prefers-color-scheme` and again under `body[data-theme="dark"]`), plus `public/index.html`
  and `public/tools.html` as rendered examples. Its craft markers include a heavy 3px
  `var(--rule)` above every section head, hairline rules between rows, a bold label on the
  left with its figure on the right, ruled 1px-gap grids instead of floating cards, and the
  `.facts` Nutrition Facts panel. Type is Bricolage Grotesque (display), Instrument Sans
  (body) and Geist Mono (eyebrows, figures, labels).
- **signature_motif:** The Nutrition Facts label, which the site already uses. The dashboard
  should read as the same product, adapted to dense data: tables, charts and stat rows.
- **stack_status:** locked. The page is one self-contained HTML file
  (`public/dashboard.html`) with inline CSS, inline JS and hand-built SVG. There is no
  build step and no framework.
- **runtime_constraints:**
    - **Zero third-party network requests.** Fonts are self-hosted as woff2 and served by
      this server (no Google Fonts or CDN). Use the same three families as the reference,
      and subset them to Latin where practical. Each font's OFL licence ships beside it.
    - **CSP:** `src/index.ts` sets a default CSP only when a response has none. Its
      `font-src` lists only `https://fonts.gstatic.com https://cdn.jsdelivr.net`, with no
      `'self'`. The `/dashboard` response therefore needs its own CSP that adds
      `font-src 'self'` and otherwise matches the default, and the preview server
      (`PREVIEW_CSP`) must send the same string.
    - No `data:` images or fonts (img-src is `'self'`).
    - It must work in iPhone Safari (current iOS) at 390px with no horizontal page scroll,
      and in desktop browsers. Light and dark mode, with the existing in-page theme toggle
      and pre-paint theme script kept.
    - Production runs in Docker on the user's home server: `bun src/index.ts` serves files
      from `public/`.
- **files_to_read:** `public/dashboard.html` (the current page; the round-2 build),
  `public/styles.css` (the reference system), `src/dashboard.ts` (routes and payload),
  `src/dashboard-stats.ts`, `src/index.ts` (the `dashboardEnabled()` mount block and the
  default CSP), `scripts/dashboard-preview.ts`, `scripts/dashboard-e2e.ts`,
  `src/dashboard-fixture.test.ts` (CSP sync test), `docs/redesign/archive/round-2/REQUIREMENTS.md`
  (the feature spec, §0–§0c included), `docs/redesign/archive/round-2/IMPLEMENTATION_LOG.md`,
  and CLAUDE.md, section "Personal dashboard (`/dashboard`)".
- **key_views:** Login card. The shared header, tab bar, range control (7 days · 30 days ·
  1 year) and theme toggle. The **Today**, **Trends**, **Body** and **Meals** tabs, including
  the Body details form, the Log weight form, the inline meal editor, every tooltip, and the
  loading, empty, error and 401 states.
- **feature_inventory_hints:** Everything in `archive/round-2/REQUIREMENTS.md`, including
  §0c. Goal vs Est. burn (break-even) wording. kcal balance beside grams. Weekly and monthly
  Trends buckets with "n of m days logged". Resting + active burn split. The dimmed
  in-progress day. The Estimate vs reality card. Today's 7-day pair. The Treat meal type. The
  over-goal striping with the word "over". Amber gain and blue loss shown with a sign. The
  `#hash` tab routing. Tolerance of `localStorage` failure.
- **existing_api (unchanged — paths, payloads, status codes):**
  `POST /api/dashboard/login`, `GET /api/dashboard/data?days=N`, `POST /api/dashboard/body`,
  `POST /api/dashboard/weight` and `PATCH /api/dashboard/meals/:id`. The exact shapes are in
  `src/dashboard.ts` and `archive/round-2/REQUIREMENTS.md` §1.3, §0b and §0c.
- **new_api_needed:** none beyond static font files.
- **frontend_layout:** The source and the output are the same file,
  `public/dashboard.html`. It is tracked in git and not generated: `gen:all` and
  `depersonalize` leave it alone. `src/index.ts` and the preview both read it fresh on
  every request.
- **backend_touch_allowed (fonts only):**
    1. New `public/dashboard-fonts/` holding the woff2 files and their OFL licence texts.
    2. `src/dashboard.ts`: a `GET` route for those font files (an allowlisted filename,
       `font/woff2` content type, long cache), inside `createDashboardRouter()` so it
       exists only when the dashboard is enabled.
    3. `src/index.ts`: inside the `dashboardEnabled()` block only, give the `/dashboard`
       response its own CSP with `font-src 'self'`.
    4. `scripts/dashboard-preview.ts`: serve the same font route and send the same CSP.
       Update the CSP-sync test in `src/dashboard-fixture.test.ts` to match.
    5. Tests for the font route, if needed.
- **do_not_touch:** `src/mcp.ts`, the MCP Apps widgets (`public/widgets/`), the public site
  pages and `public/styles.css`, all generators (`scripts/gen-*.ts`), everything else in
  `src/`, the Dockerfile and `docker-compose.yml`, the `/api/dashboard/*` handlers and
  payloads, and the main checkout at `/Users/fersilio/Github/nutrition-mcp` (another session
  uses it).
- **protected_data:** The user's real Supabase meals, water, weight, goals and profile.
  Read only, never write. No real-data server runs this round. All checks and screenshots
  use the fixture preview.
- **test_commands:** `bun test`, `bun run typecheck`, `bun run format:check`.
- **verify_commands:** The round-2 E2E is `scripts/dashboard-e2e.ts` (Playwright + axe).
  Setup and run instructions are in `archive/round-2/IMPLEMENTATION_LOG.md`, "How to look
  at it". Run it against a second preview on port 8793. It is the regression net: every
  feature check must still pass, and selectors may be updated only where the markup
  legitimately changed. Visual QA uses Claude in Chrome.
- **deploy:** Fixture preview, `bun run dashboard:preview`, at
  http://localhost:8791/dashboard. It is already running from this worktree with
  `bun --watch scripts/dashboard-preview.ts` (identify it with `lsof -iTCP:8791`). It reads
  the HTML fresh on each request; restart it after editing `scripts/` or `src/`. Scenarios
  are `?scenario=full|over-goal|no-body|no-goals|empty|lb|calibrate`, and failure modes are
  `?delay=2000` and `?fail=500|401`. Promotion to the home server is the user's decision.
- **extra_acceptance:**
    - Feature parity with round 2: the E2E is green, and no feature or state is lost.
    - Network panel: every request goes to the page's own origin, the fonts included, and
      the fonts actually render, with no fallback.
    - A style tile is screenshotted beside the reference before building the views.
    - Final screenshots of every tab at 390px and 1440px, light and dark, go in
      `docs/redesign/screenshots/`.
    - Design-quality scores per view against the reference go in `IMPLEMENTATION_LOG.md`.
      Every score is ≥ 4.
    - Estimates stay labelled as estimates. Colour is never the only cue. Tabs are usable
      on iPhone.
