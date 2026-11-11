# Redesign brief — Personal nutrition dashboard (`/dashboard`)

> **Drafted by the researcher from the user's request. The user should confirm it.**
> The user's request: "I'd like to improve the UI with fresher colours, tabs,
> organization. Find a better UI and show me in a localhost so that I can improve
> before promoting the changes to the asus [home server]."

- **app_name / url:** nutrition-mcp personal dashboard. It is served at `GET /dashboard`
  by the existing Bun + Hono server when `DASHBOARD_ENABLED=true`. Something on this Mac
  already answers at `http://localhost:8090/dashboard` (the docker-compose port mapping).
  Leave it alone. Previews run on their own ports (see `deploy`).
- **domain_and_users:** A single user, the owner, views their own nutrition logs:
  meals, macros, calories against an activity-adjusted daily goal, estimated burn and
  body change, and weight against target and BMI. They check it briefly, a few times a
  day, mostly on an iPhone and sometimes on a desktop. The data is logged through Claude
  via MCP tools. The dashboard only reads, except for the Body details form.
- **mood:** Fresher colours. Mint/sage-tinted light mode and forest-tinted dark mode
  (not grey), with an emerald brand accent in the same family as the public site's
  green. The palette must feel calm, clinical-clean and friendly, like Apple Health or
  MacroFactor. Avoid: flat grey on grey, every block at equal weight, one long scroll,
  neon, gradients that hurt contrast, and red/green as the only signal.
- **stack_status:** locked to "vanilla". The page is one self-contained HTML file with
  inline CSS, inline JS and hand-built SVG. A build step is allowed only if it compiles
  to a single inlined file and clearly beats hand-written code. The researcher's
  decision is to keep vanilla (see REQUIREMENTS §3).
- **runtime_constraints:** Zero network requests other than the page's own origin
  `/api/dashboard/*`: no CDN and no web fonts. The server CSP is
  `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline' …; img-src 'self'`,
  which means no `data:` images. It must work in iPhone Safari (current iOS) at 390px
  with no horizontal page scroll, and in desktop browsers. It runs in a Docker
  container on the Asus home server, where `bun src/index.ts` serves the file straight
  from `public/`.
- **files_to_read:** `public/dashboard.html`, `src/dashboard.ts`,
  `src/dashboard-stats.ts`, `src/body.ts`, `src/insights.ts` (`buildDailyBuckets`),
  `src/activity.ts`, `src/index.ts` (mount + CSP), the `dashboard API` block in
  `src/mcp.test.ts`, `src/dashboard-stats.test.ts`, `scripts/widget-harness.ts`
  (pattern for a dev-only server), and CLAUDE.md, "Personal dashboard (`/dashboard`)".
- **key_views:** Login card; Today; Trends; Body (weight); Meals. Shared header, tab bar
  and range control.
- **feature_inventory_hints:** The activity-adjusted goal basis ("1,800 + 5 active").
  The per-day goal step line. Estimated-burn dots. The in-progress (today) day, drawn
  dimmed and excluded from multi-day balance. Net estimated change over complete days.
  BMI category. Healthy range at height. Projection date or "not heading there". The
  body form opens automatically when details are missing. 401 signs the user out. 429
  on login. `localStorage` failure tolerated. Water and sugar are already in the
  payload but not shown today.
- **existing_api:** `POST /api/dashboard/login`, `GET /api/dashboard/data?days=N`,
  `POST /api/dashboard/body`. The payloads are in REQUIREMENTS §1.3 and must stay
  unchanged.
- **new_api_needed:** none.
- **frontend_layout:** Source and output are the same file, `public/dashboard.html`.
  It is tracked in git and is not generated: `gen:all` and `depersonalize` do not
  touch it. `src/index.ts` reads it with `Bun.file("./public/dashboard.html")` on each
  request.
- **backend_touch_allowed:**
    1. `src/dashboard.ts`: extract the pure payload assembly into an exported
       `buildDashboardPayload(inputs)` that `dashboardPayload` calls. This is
       behaviour-preserving.
    2. New dev-only `scripts/dashboard-preview.ts`.
    3. `package.json`: add one script, `dashboard:preview`.
    4. New test file(s) for the preview fixture and drift guard, if needed.
- **do_not_touch:** Everything else in `src/` (MCP tools, widgets, OAuth, Supabase
  layer), `public/` other than `dashboard.html`, the generators, the Dockerfile,
  `docker-compose.yml`, and `/Users/fersilio/Github/nutrition-mcp` (the main checkout,
  used by another session).
- **protected_data:** The user's real Supabase data (meals, weights, goals, profile,
  activity). Previews use the fixture server. A real-API check may only log in (which
  creates a token row) and read. Do not submit the Body form against real data unless
  the user asks.
- **test_commands:** `bun test`, `bun run typecheck`, `bun run format:check`.
- **verify_commands:** None exist yet. The implementer adds the preview script and uses
  a headless browser (Playwright via `bunx`, or Claude in Chrome) for screenshots and
  axe.
- **deploy:** Fixture preview: `bun run dashboard:preview`, which serves
  `http://localhost:8791/dashboard`. Real-data preview:
  `DASHBOARD_ENABLED=true PORT=8792 bun --watch src/index.ts`, which serves
  `http://localhost:8792/dashboard`. Promotion to the Asus is the user's decision:
  merge, then `docker compose up -d --build` on the Asus. The implementer does not
  deploy.
- **extra_acceptance:** The user reviews in a localhost preview and iterates before
  promotion. Estimates stay labelled as estimates. Colour is never the only cue.
  Tabs are usable on iPhone.
