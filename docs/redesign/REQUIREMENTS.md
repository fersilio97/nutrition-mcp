# Dashboard redesign — requirements

Status: **approved by the user 2026-11-09, with the decisions in §0**. Stage 2
(`frontend-implementer`) builds exactly this. The brief is `docs/redesign/BRIEF.md`.

## 0. User decisions (2026-11-09) — these override anything below

| Question                     | Decision                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Over-goal calorie bars       | **As specified:** only the part above the goal line is red-striped, with the word "over".                                                  |
| Gain / loss colours          | **As specified:** amber gain (`--gain`), blue loss (`--loss`); sign and direction carry the meaning.                                       |
| Start tab                    | **As specified:** `#hash` if present, otherwise Today.                                                                                     |
| N1 Water & sugar on Today    | **Not selected** — stays an optional nice-to-have; do not build unless everything else is done.                                            |
| N2 1-year range              | **Required.** Range control becomes 7 · 30 · 90 · 1 year (`days=365`) on Trends and Meals. Move it out of §4.10 into acceptance.           |
| Review screenshots           | **Commit them** to `docs/redesign/screenshots/` (390px and 1440px, light and dark, every tab).                                             |
| **New: estimate vs reality** | **Required.** See §4.11: estimated grams gained/lost over the period vs the actual weight change from weigh-ins, and what the gap implies. |

Scope: `public/dashboard.html`, plus the minimal additive backend and dev tooling
listed in §5. The API contract does not change.

---

## 1. Current app: inventory and pain points

### 1.1 Views and sections today (one long scroll)

| #   | Block                                 | What it shows / does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L   | Login card                            | Title "Your nutrition dashboard". Help text "Sign in with the same email and password you used to connect your MCP client." Email field (`autocomplete=username`) and Password field (`current-password`). "Sign in" button. Error line (`role=alert`): "Too many attempts. Wait a minute and try again." (429), "Email or password is incorrect." (other non-OK), "Could not reach the server." (network).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| H   | Header                                | "Your nutrition". **Theme** toggle (persists `nutrition-dash-theme` = `light`/`dark`; re-renders charts). **Sign out** (clears `nutrition-dash-token`, shows login).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S   | Range label                           | "Today, Mon, Nov 9 · America/New_York", or "Tue, Oct 11 to Mon, Nov 9 · tz". On a fetch failure: "Could not load data. Is the server running?"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R   | Range toggle                          | Today / 7 days / 30 days (default) / 90 days, using `aria-pressed`. Changing it refetches `?days=`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T   | Stat tiles                            | **Today**: kcal eaten, a meter against `goal_calories` (red when over), foot "N kcal left of G" or "N kcal over G", plus basis " (1,800 + 5 active)" when `active_kcal`. With no goal: "No calorie goal set". **Protein today**: g, "of X g" + meter if `goal_protein_g`. **Fiber today**: g, "of X g" + meter if `goals.fiber_g`. **Est. burn today** (only if `burn_kcal`): kcal, foot "±N g so far (est.)" or "Nothing eaten logged yet". **Daily average** (range > 1): avg kcal over logged days, "L of N days logged".                                                                                                                                                                                                                                                                                                                                                                           |
| C   | Calories per day                      | Note: "Each day's goal is your {goals.calories} kcal baseline plus that day's active calories from your watch; bars above it are red." or "No calorie goal set." Legend: Eaten / Goal (incl. active kcal) / Over goal / Est. burn. One bar per day, the whole bar red when over and 0.75 opacity when `in_progress`. The goal is a step line with end label "Goal N". Burn is a dot. Tooltip: date (+ " · so far"), Eaten, Goal, incl. active +N, Est. burn, Est. change ±N g, Meals N. Empty: "Nothing logged in this range."                                                                                                                                                                                                                                                                                                                                                                         |
| B   | Estimated body change (inside card C) | Diverging bars of `balance_g`: gain is up in `--over`, loss is down in green. The in-progress day is excluded when range > 1. Direct labels "±N g" (with `*` for in progress) when ≤ 14 days. Note: "(eaten − estimated burn) ÷ 7.7 kcal per gram. An estimate for spotting the trend — daily scale weight swings far more with water and salt." + " Net over N complete logged days: ±N g." No burn data: "Add your height, birth date and sex under Weight tracker → Body details to estimate this." Tooltip: Est. change, Eaten − burn kcal.                                                                                                                                                                                                                                                                                                                                                        |
| M   | Macros per day                        | Stacked protein / carbs / fat grams, with a 2px gap between segments and only the top segment rounded. Note "Stacked grams of protein, carbs and fat." Tooltip: per-macro g. Empty state as in C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| W   | Weight tracker                        | Note: "N weigh-ins since {weightWindowStart}, in {unit}." or "No weigh-ins in the last N days." Stats grid: **Current** (value + "Logged Mon d", or "No weigh-ins" / "Ask Claude to log your weight"). **BMI** (value + category label; or "Add details" / "Body details below"; or "—" / "Needs a weigh-in"). **Healthy range** (min–max unit, "BMI 18.5–24.9 at N cm"). **Change** (±x.x unit, "over N days · ±x.xx unit/week"; or "Needs 2+ weigh-ins on different days"). **To target** (if `target_g`: ±x.x; foot "At target" / "At this rate: {date}" / "Current trend is not heading there" / "Target x unit"). **Resting burn** (BMR kcal, "BMR · Mifflin-St Jeor · age N"). The chart is time-scaled, with a line + dots (r=4), a target line labelled "Target x", a healthy-BMI band, start/end date labels, and a tooltip (date, weight, BMI). Legend: Weight / Target / Healthy BMI range. |
| BD  | Body details (`<details>` inside W)   | Note: "Used only for BMI, your healthy weight range and the estimated daily burn (Mifflin-St Jeor × 1.2 for a desk day, plus your workouts' active calories)." Height number (step 0.1, min 20, max 272) + unit select cm/in (defaults to `in` when `weightUnit === "lb"`). Birth date (date). Sex (— / Male / Female). Save. Status line (`role=status`): "Saving…", "Saved.", the server `error_description` or "Could not save.", "Could not reach the server." It auto-opens when any detail is missing, unless the user has toggled it. On success it refetches.                                                                                                                                                                                                                                                                                                                                  |
| ML  | Recent meals                          | Note "Every figure plotted above, as numbers." Table: Date (browser-tz short date), Meal (type or "-"), Description, kcal, P, C, F, Fib. Empty: "No meals logged in this range."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| TT  | Tooltip                               | A fixed-position `#tip`, hidden on scroll.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Behaviour that must survive: a token in `localStorage` boots straight into the app. Any
401 calls `signOut()`. `localStorage` access goes through try/catch. `parseDay` parses
`YYYY-MM-DD` by hand (never `new Date(iso)`). `esc()` is applied to every user string
(meal descriptions). `fmt` uses `toLocaleString`. Signed values use the real minus
sign `−`.

### 1.2 Pain points

1. **One long scroll at equal visual weight.** The question "how am I doing today"
   competes with 90-day charts and the weight form. There is no hierarchy.
2. **Today is a range value, not a place.** Picking "Today" turns every chart into a
   single fat bar.
3. **Flat grey palette.** The blue/orange/aqua series do not match the in-chat widgets
   (calories orange, protein violet, carbs green, fat rose). Light-mode aqua fat is
   2.74:1, below 3:1.
4. **Over goal is colour-only.** The whole bar turns red, so red/green colour-blind
   users must rely on the goal line alone. Gain/loss is red vs green.
5. **iPhone:** (a) tooltips fire on `mousemove` only, so they are dead on touch. (b) The
   charts use a fixed 860-wide `viewBox`, so 11px labels render at about 5px on a
   390px screen. (c) The meals table is `nowrap` with a 220px minimum description
   column, so it scrolls sideways.
6. **Theme flash.** The saved theme is applied by the script at the end of `<body>`,
   so dark-mode users see a light flash.
7. **Timezone bug.** Meal dates are rendered in the _browser_ zone, not
   `data.timezone`.
8. **Data shown nowhere:** `waterMl`, `goals.water_ml`, `sugar_g`, `goals.sugar_g`,
   `goal_carbs_g`, `goal_fat_g`, `meal.sugar_g`.

### 1.3 API contract (unchanged)

- `POST /api/dashboard/login` takes `{email, password}`. It returns `200 {access_token}`,
  `400 {error:"invalid_request"}`, `401 {error:"invalid_credentials"}`, or `429`
  (rate limit).
- `GET /api/dashboard/data?days=N` takes N clamped to 1–365 (default 30) and a bearer
  token. It returns:
  `{ timezone, weightUnit:"kg"|"lb", startDate, endDate, days, body{height_cm,birth_date,sex}, weightStats{latest_g, latest_date, height_cm, age, bmi, bmi_category, healthy_min_g, healthy_max_g, change_g, weekly_rate_g, trend_days, target_g, to_target_g, projected_date, bmr_kcal, burn_today_kcal, missing[]}, weightWindowStart, goals{calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, water_ml, target_weight_g}|null, daily[{date, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, waterMl, mealCount, active_kcal, goal_calories, goal_protein_g, goal_carbs_g, goal_fat_g, burn_kcal, balance_g, in_progress}], weights[{date, logged_at, weight_g}], meals[≤50, newest first: {id, logged_at, meal_type, description, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g}] }`.
  `daily` always ends with today (`in_progress: true`), whatever N is. The weight
  window is `max(N, 90)` days.
- `POST /api/dashboard/body` takes `{height:number|null, height_unit:"cm"|"in", birth_date:"YYYY-MM-DD"|null, sex:"male"|"female"|null}`.
  It returns `200 {ok:true, body}` or `400 {error, error_description}`.

---

## 2. Research (stack locked; patterns researched)

The stack is effectively locked by CLAUDE.md ("one self-contained file, inline CSS/JS,
hand-built SVG, zero network requests"). Research therefore concentrated on
information architecture, navigation and colour, plus one check of whether a
single-file build step would be worth it.

| Finding                                                                                                                                                                                                                         | Source                                                                                                                                                                                                                                | Used for                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| MacroFactor 4.0: a main dashboard as an "at-a-glance view and launch point", with each section (Nutrition, Body Metrics, Insights & Analytics…) having its own inner dashboard via "See All"; Energy Balance lives in Insights. | [macrofactor.com/dashboard-customization](https://macrofactor.com/dashboard-customization/) (updated 2024-11-20, foundational)                                                                                                        | Today = glance; Trends/Body = inner dashboards             |
| Cronometer (2025-01-13): the Energy Summary is three circles — Consumed, Expenditure, Target-or-Balance — with Balance shown as deficit/surplus.                                                                                | [cronometer.com/blog/sp-2](https://cronometer.com/blog/sp-2)                                                                                                                                                                          | Today "energy trio" (Eaten / Est. burn / Est. change)      |
| Garmin Connect redesign: a sectioned, customizable home ("Today's Activity", "In Focus", "At a Glance"), compared to Fitbit's "Today" tab.                                                                                      | [dcrainmaker.com 2024-01](https://www.dcrainmaker.com/2024/01/garmin-connect-mobile-revamp-walk-through.html), [androidcentral](https://www.androidcentral.com/wearables/garmin-connect-beta-redesign-is-long-overdue) (foundational) | A "Today" first tab is the norm                            |
| Apple Health: a Summary tab with Highlights and Trends; trends compare a metric over weeks.                                                                                                                                     | [imore.com/health-ios](https://www.imore.com/health-ios), [macrumors 2021](https://www.macrumors.com/2021/06/07/apple-unveils-new-health-app-features/) (foundational)                                                                | Trends summary tiles                                       |
| Apple HIG: a tab bar switches between distinct sections; a segmented control is for closely related choices within one view.                                                                                                    | [HIG segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls), [HIG tab views](https://developer.apple.com/design/human-interface-guidelines/tab-views)                                  | Tabs for sections; segmented control for the range only    |
| WAI-ARIA APG Tabs: `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`; Left/Right wrap, Home/End; automatic activation is recommended when panels display instantly (content in DOM).              | [w3.org/WAI/ARIA/apg/patterns/tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)                                                                                                                                                   | Tab bar a11y spec                                          |
| Bun standalone HTML: `bun build --compile --target=browser ./index.html` inlines JS/CSS/assets into one file. No code splitting; assets are base64 (+33%). The local Bun is 1.4.2.                                              | [bun.com/docs/bundler/standalone-html](https://bun.com/docs/bundler/standalone-html) (2026 docs)                                                                                                                                      | Considered and rejected for now (§3)                       |
| `oklch()` (Safari 15.4+) and `color-mix()` (Safari 16.2+) are Baseline widely available.                                                                                                                                        | [web-features explorer: color-mix](https://web-platform-dx.github.io/web-features-explorer/features/color-mix)                                                                                                                        | `color-mix()` allowed for tints; tokens stay hex for audit |
| Anthropic's official `frontend-design` Claude Code skill pushes a cohesive palette as CSS variables and intentional motion, away from generic defaults.                                                                         | [skills.sh/anthropics/claude-plugins-official/frontend-design](https://skills.sh/anthropics/claude-plugins-official/frontend-design)                                                                                                  | Implementer may load it; tokens below are the contract     |

Repo precedents (no web needed): the in-chat widget series palette in
`public/widgets/STYLE_GUIDE.md` (calories orange, protein violet, carbs green, fat
rose, fiber teal, sugar lime, water sky). The public site's emerald `--accent #3b7a4f`
and "forest-tinted, not grey" dark mode in `public/styles.css`.

---

## 3. Decision: keep vanilla, single hand-written file

| Candidate                                             | LLM familiarity | Owned in repo | Build simplicity                         | Fit (zero-network, served raw by `Bun.file`, Docker)                                                   | Migration cost            | Headless testing           |
| ----------------------------------------------------- | --------------- | ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------- |
| **Keep: vanilla JS + inline CSS + hand SVG (chosen)** | very high       | yes, 1 file   | none                                     | perfect, unchanged route                                                                               | lowest (rewrite in place) | Playwright against preview |
| Bun standalone HTML (TS modules → one file)           | high            | yes           | adds a build step + a generated artifact | needs the route/Dockerfile to know about `dist/`; CLAUDE.md says the file is tracked and not generated | medium                    | same                       |
| Preact/React + Vite singlefile                        | very high       | partly        | Vite contradicts CLAUDE.md ("not Vite")  | needs a build in Docker                                                                                | high                      | good                       |
| Svelte / Astro                                        | medium-high     | yes           | build step                               | build in Docker                                                                                        | high                      | good                       |
| Tailwind v4 via bun plugin                            | high            | n/a           | build step                               | inlined OK, but needs a build                                                                          | medium                    | n/a                        |

- **Bun standalone HTML** lost because the page is about 2–3k lines and owned by
  agents. Splitting it into modules would help readability. The cost is a second
  source of truth (src vs built file), a build step `gen:all` doesn't run, and a
  change to `src/index.ts`'s route. Revisit if the file passes ~4k lines.
- **React/Preact/Vite** lost because CLAUDE.md forbids Vite. The UI has four tabs and
  six charts of mostly static rendering, where a virtual DOM buys nothing.
- **Svelte/Astro** lost on the build step plus the Docker change, for no user-visible
  gain.
- **Tailwind** lost because the token set is small and hand CSS with custom properties
  is already the repo's idiom.

Language rules for the rewrite:

- Keep a single IIFE in a `<script>` and `"use strict"`.
- ES2020 syntax is allowed (`const`/`let`, arrow functions, template literals,
  optional chaining). Target current iOS Safari and evergreen desktop browsers.
- No `import`, no `eval`, no external URLs, no `data:` URIs (the CSP has
  `img-src 'self'`). Patterns and icons are inline `<svg>`.

How each runtime constraint is met:

- **Zero network:** inline everything and use system fonts.
- **CSP:** inline script and style are allowed. No `data:` and no remote resources.
- **Served raw:** the file path and route are unchanged.
- **Container:** no Dockerfile change.
- **iPhone:** see §4.4 and §4.7.

---

## 4. Design requirements

### 4.1 Information architecture: four tabs

| Tab        | Hash      | Range control?                                                                           | Contents (top → bottom)                                                                                                                                                                                                                    |
| ---------- | --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Today**  | `#today`  | **No.** Always today (`daily[daily.length-1]`).                                          | 1. Calorie ring hero. 2. Energy trio: Eaten · Est. burn · Est. change. 3. Nutrient bars: Protein, Carbs, Fat, Fiber (+ Sugar and Water, nice-to-have N1). 4. "Last 7 days" mini strip (tap → Trends). 5. Today's meals (local-day filter). |
| **Trends** | `#trends` | **Yes:** 7 · 30 · 90 days (default 30).                                                  | 1. Summary tiles: Daily average, Avg protein, Days over goal, Net est. change. 2. Calories per day (+ burn). 3. Estimated body change. 4. Macros per day.                                                                                  |
| **Body**   | `#body`   | **No.** The weight window is the server's `max(days,90)`, which is 90 with these ranges. | 1. Weight hero (current + change/week + to target). 2. Stats grid (BMI, Healthy range, Change, To target, Resting burn, Est. burn today). 3. Weight chart. 4. Body details form.                                                           |
| **Meals**  | `#meals`  | **Yes,** shared with Trends (same state, same fetch).                                    | Meals grouped by local day (newest first), each group headed by its date and the day subtotal (kcal · P · C · F). Footer: "Showing the {n} most recent meals in this range" (always, since the API caps at 50).                            |

**Data flow.**

- Make one fetch per range: `GET /api/dashboard/data?days={range}`, where the range is
  7, 30 or 90. Boot uses the stored range (default 30).
- Today reads the last `daily` row plus `data.meals` filtered to `endDate`, so it
  never refetches.
- Switching tabs never fetches. Changing the range refetches and re-renders every
  panel.
- If the range is 7, Today's mini strip uses all 7 rows. Otherwise it uses the last 7.

**Persistence.**

- The active tab lives in `location.hash`, with `#today` as the default.
- On `hashchange`, select that tab.
- The range is stored in `localStorage` under `nutrition-dash-range`, wrapped in
  try/catch like the other keys.

### 4.2 Colour tokens (WCAG-checked)

Declare these in four places, as today:

1. `:root` (light).
2. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`.
3. `:root[data-theme="dark"]`.
4. `:root[data-theme="light"]` for explicit light. (`:root` covers it, but keep the
   selector so a forced light theme also beats the media query.)

Every rule uses `var(--…)`. JS reads colours via `cssVar()` only when it builds SVG.
SVG marks take colour through CSS, as `style="fill:var(--x)"` or a class such as
`.mark-kcal{fill:var(--kcal)}`, never the presentation attribute `fill="var(--x)"`,
which is not reliable. That way a theme switch needs no re-render.

| Token           | Light                                                            | Dark      | Role                                                                                                      |
| --------------- | ---------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `--bg`          | `#f3f7f4`                                                        | `#0a1310` | page (mint paper / forest black)                                                                          |
| `--surface`     | `#ffffff`                                                        | `#111d18` | cards                                                                                                     |
| `--surface-2`   | `#e8f0eb`                                                        | `#182821` | insets, tracks, tab bar background, table zebra                                                           |
| `--border`      | `#d5e0d9`                                                        | `#263a31` | decorative hairlines (not required to be 3:1)                                                             |
| `--control`     | `#7b8c82`                                                        | `#5d7468` | input/select/segmented outlines (UI component, ≥3:1)                                                      |
| `--grid`        | `#e3ebe6`                                                        | `#1c2c25` | chart gridlines                                                                                           |
| `--ink`         | `#0f1f18`                                                        | `#e6f0ea` | primary text                                                                                              |
| `--muted`       | `#4a5d53`                                                        | `#a6b8ae` | secondary text, axis labels, goal line                                                                    |
| `--subtle`      | `#586960`                                                        | `#8fa298` | tertiary text (footnotes, "est." tags)                                                                    |
| `--accent`      | `#0a7255`                                                        | `#3dd6a0` | brand emerald: selected tab indicator, primary button, focus-adjacent, weight line, ring "under goal" arc |
| `--accent-ink`  | `#ffffff`                                                        | `#04261b` | text on `--accent`                                                                                        |
| `--accent-soft` | `#d9f0e5`                                                        | `#123a2c` | selected tab/segment fill, healthy-range band                                                             |
| `--focus-ring`  | `#1a66d1`                                                        | `#7fb2ff` | 2px outline + 2px offset                                                                                  |
| `--kcal`        | `#d4570b`                                                        | `#fb923c` | calories eaten (bars, ring track fill)                                                                    |
| `--protein`     | `#7c3aed`                                                        | `#b197fc` | protein                                                                                                   |
| `--carbs`       | `#16803a`                                                        | `#4ade80` | carbs                                                                                                     |
| `--fat`         | `#d6265f`                                                        | `#fb7199` | fat                                                                                                       |
| `--fiber`       | `#0f7f78`                                                        | `#2dd4bf` | fiber                                                                                                     |
| `--sugar`       | `#5c7f0a`                                                        | `#bef264` | sugar (limit)                                                                                             |
| `--water`       | `#0a78b8`                                                        | `#38bdf8` | water                                                                                                     |
| `--burn`        | `#2f5fd0`                                                        | `#7aa7ff` | estimated burn markers (hollow ring)                                                                      |
| `--over`        | `#c4262e`                                                        | `#ff6b6b` | over goal (always paired with a hatch, a label or the word "over")                                        |
| `--gain`        | `#b45309`                                                        | `#f6ad55` | estimated gain (bars go **up**, label "+N g")                                                             |
| `--loss`        | `#1d64b8`                                                        | `#6cb4ff` | estimated loss (bars go **down**, label "−N g")                                                           |
| `--warn`        | `#9a5b00`                                                        | `#f0b44c` | "needs details" notices                                                                                   |
| `--shadow-card` | `0 1px 2px rgb(15 31 24/.05), 0 6px 20px -8px rgb(15 31 24/.12)` | `none`    | card elevation                                                                                            |

**Gain and loss are amber vs blue, not red vs green, on purpose.** Gaining is not
"bad" for everyone, and blue/amber stays distinguishable under the common forms of
colour blindness. Both are also separated by bar direction and sign.

**Contrast ratios** (computed with the WCAG 2.x relative-luminance formula).

Text, which needs 4.5:1 for body and 3:1 for large text:

| Pair                                 | Light | Dark  |
| ------------------------------------ | ----- | ----- |
| ink / bg                             | 15.80 | 16.18 |
| ink / surface                        | 17.08 | 14.86 |
| ink / surface-2                      | 14.72 | 13.21 |
| ink / accent-soft                    | 14.27 | 10.81 |
| muted / bg                           | 6.51  | 9.06  |
| muted / surface                      | 7.04  | 8.32  |
| muted / surface-2                    | 6.07  | 7.39  |
| muted / accent-soft                  | 5.88  | 6.05  |
| subtle / bg                          | 5.39  | 7.00  |
| subtle / surface                     | 5.83  | 6.42  |
| subtle / surface-2                   | 5.02  | 5.71  |
| subtle / accent-soft                 | 4.87  | 4.67  |
| accent-ink / accent (buttons)        | 5.91  | 8.72  |
| accent as text / surface             | 5.91  | 9.34  |
| accent as text / bg                  | 5.47  | 10.17 |
| accent as text / accent-soft         | 4.94  | 6.79  |
| over as text / surface ("over" foot) | 5.73  | 6.24  |
| warn as text / surface               | 5.43  | 9.35  |
| gain as text / surface               | 5.02  | 9.09  |
| loss as text / surface               | 5.89  | 7.92  |

Graphics and UI, which need 3:1 against the adjacent surface:

| Token   | on surface (light) | on surface-2 (light) | on surface (dark) | on surface-2 (dark) |
| ------- | ------------------ | -------------------- | ----------------- | ------------------- |
| kcal    | 4.06               | 3.50                 | 7.65              | 6.80                |
| protein | 5.70               | 4.91                 | 7.18              | 6.38                |
| carbs   | 5.02               | 4.33                 | 9.94              | 8.83                |
| fat     | 4.88               | 4.21                 | 6.53              | 5.81                |
| fiber   | 4.85               | 4.18                 | 9.30              | 8.27                |
| sugar   | 4.67               | 4.03                 | 13.25             | 11.78               |
| water   | 4.78               | 4.12                 | 8.08              | 7.19                |
| burn    | 5.72               | 4.93                 | 7.26              | 6.45                |
| over    | 5.73               | 4.94                 | 6.24              | 5.55                |
| gain    | 5.02               | 4.33                 | 9.09              | 8.08                |
| loss    | 5.89               | 5.07                 | 7.92              | 7.04                |
| accent  | 5.91               | 5.10                 | 9.34              | 8.30                |

Other UI pairs:

- `--control` / surface: light 3.55, dark 3.43.
- `--control` / bg: light 3.28, dark 3.74.
- `--focus-ring` / bg: light 5.02, dark 8.72.
- `--focus-ring` / surface: light 5.43, dark 8.01.

Rules that follow from the table:

- **Series colours are never used as body text in light mode.** `--kcal` light is
  4.06/3.50, which passes for graphics only. Series names in legends and labels are
  set in `--ink`/`--muted` next to a swatch.
- **`--kcal` vs `--over` is only 1.41:1, and `--gain` vs `--loss` is 1.17:1.** The
  distinction must never rest on colour:
    - Over goal is shown by the goal line crossing the bar, a hatch pattern on the
      above-goal segment, and the word "over" in the tooltip, foot and table.
    - Gain/loss is shown by bar direction, the "+"/"−" sign in every label, and a zero
      baseline.
- Stacked macro segments keep the 2px surface-coloured gap.
- The implementer re-verifies any token they change with the same formula and
  updates this table.

### 4.3 Typography

- **Font stack:**
  `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`.
  This is SF Pro on iPhone and is never fetched.
- **Numbers:**
    - Large hero figures use proportional digits (keep the existing rationale) at
      weight 700.
    - Tables, tooltips, axis ticks, stat-grid figures and the meals list use
      `font-variant-numeric: tabular-nums`.
- **Scale** (px / line-height / weight):

    | Token        | Size | Line-height | Weight | Notes                                 |
    | ------------ | ---- | ----------- | ------ | ------------------------------------- |
    | `--t-hero`   | 40   | 1.0         | 700    | ring centre figure; 34 at ≤480px      |
    | `--t-figure` | 26   | 1.1         | 680    | stat cards                            |
    | `--t-title`  | 20   | 1.2         | 680    | page title                            |
    | `--t-h2`     | 16   | 1.3         | 650    | card title                            |
    | `--t-body`   | 15   | 1.5         | 400    | body                                  |
    | `--t-small`  | 13   | 1.45        | 400    | notes and feet                        |
    | `--t-micro`  | 12   | 1.35        | 600    | labels, uppercase, +0.04em, `--muted` |

    Chart text is 12px _rendered_: SVG must be sized in real pixels (§4.7). Inputs are
    16px on mobile to stop iOS zoom-on-focus.

- Letter-spacing: −0.02em on the hero/figure tokens, 0 elsewhere.

### 4.4 Spacing, radius, elevation, breakpoints

- **Spacing:** a 4px base: `--s1 4, --s2 8, --s3 12, --s4 16, --s5 20, --s6 24, --s8 32, --s12 48`.
- **Radius:** `--r-sm 8` (inputs, segments), `--r-md 14` (cards), `--r-lg 20` (hero
  card), `--r-pill 999` (tab indicator, chips).
- **Elevation:**
    - Cards use `--shadow-card` in light and `none` in dark, where a `1px var(--border)`
      border carries the edge.
    - The sticky tab bar uses `--surface` at 92% opacity with `backdrop-filter: blur(12px)`
      and a fallback to solid `--surface`. A bottom hairline appears once the page
      scrolls.
    - The tooltip uses `0 8px 24px rgb(0 0 0/.18)`.
- **Gutters:** 16px at ≤480, 24px from 481 to 1023, 32px at ≥1024. Content is
  `max-width: 1120px`, centred.
- No horizontal page scroll at any width ≥ 320px.
- Respect `env(safe-area-inset-*)` on the left, right, top and bottom.

| Breakpoint | Header + tabs                                                                                                          | Grids                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ≤ 480      | Compact header (title + icon buttons), then a full-width sticky tab bar of 4 equal tabs (icon above label, 56px tall). | One column. Energy trio is 3 equal columns. Trends tiles are 2×2. Stats grid is 2 columns. Meals are cards.                                                                                                  |
| 481–1023   | Header row, then a sticky tab bar (icon left of label, 48px tall).                                                     | Today: ring card full width, trio beside the ring at ≥700px. Tiles in 4 columns at ≥700px. Stats grid in 3 columns.                                                                                          |
| ≥ 1024     | Header with the tab bar inline to its right (sticky together), range control right-aligned in the panel header.        | Today: 2 columns (left: ring + trio + nutrients; right: 7-day strip + today's meals). Trends: tiles in 4 columns, charts full width. Body: 2 columns (stats + form left 40%, chart right 60%). Meals: table. |

The tab bar sits at the **top** (sticky), not as a fixed bottom bar. A fixed bottom bar
competes with Safari's own bottom toolbar and home indicator on iPhone.

### 4.5 Wireframes

**Mobile (390px): Today**

```
┌──────────────────────────────────────┐
│ Nutrition           [◐] [⇥]          │  header: title, theme, sign out (icon buttons, 44×44, aria-labels)
│ Mon, Nov 9 · America/New_York        │
├──────────────────────────────────────┤
│ [●Today] [ Trends ] [ Body ] [ Meals ]│  sticky tablist, 4 equal, selected = soft pill + 3px accent bar + bold
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │        ╭─────────╮               │ │  ring: track surface-2, arc kcal, over portion hatched over
│ │       │  1,240   │  kcal eaten   │ │
│ │       │  of 1,805 │              │ │
│ │        ╰─────────╯               │ │
│ │  565 kcal left · 1,800 + 5 active│ │  or "120 kcal over 1,805" in --over + ▲ icon
│ └──────────────────────────────────┘ │
│ ┌──────────┬──────────┬──────────┐   │  energy trio
│ │ EATEN    │ EST. BURN│ EST.CHANGE│  │
│ │ 1,240    │ 2,310    │ −139 g*  │   │  * "so far, estimate"
│ └──────────┴──────────┴──────────┘   │
│ ┌ Nutrients ───────────────────────┐ │
│ │ Protein   92 / 140 g ███████░░░  │ │
│ │ Carbs    130 / 180 g ████████░░  │ │
│ │ Fat       41 / 60 g  ██████░░░░  │ │
│ │ Fiber     18 / 30 g  ██████░░░░  │ │
│ └──────────────────────────────────┘ │
│ ┌ Last 7 days ────────── See trends›┐│
│ │ ▂ ▅ ▇ ▆ ▃ ▅ ▄   (goal tick each)  ││
│ │ M T W T F S S                      ││
│ └──────────────────────────────────┘ │
│ ┌ Today's meals ───────────────────┐ │
│ │ 08:10 Breakfast        420 kcal  │ │
│ │ Oats, berries, whey  P32 C55 F9  │ │
│ │ …                                │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Mobile: Trends**

```
│ [ Today ] [●Trends] [ Body ] [ Meals ]│
│ Oct 11 – Nov 9          [7│30│90]    │  segmented, aria-pressed
│ ┌─────────────┬─────────────┐        │
│ │ DAILY AVG   │ AVG PROTEIN │        │
│ │ 1,742 kcal  │ 118 g       │        │
│ │ 27/30 logged│             │        │
│ ├─────────────┼─────────────┤        │
│ │ OVER GOAL   │ NET EST. Δ  │        │
│ │ 6 of 29 days│ −1,320 g    │        │
│ └─────────────┴─────────────┘        │
│ ┌ Calories per day ────────────────┐ │
│ │ legend: ■Eaten ▨Over ─Goal ○Burn │ │
│ │ [bars, real-px SVG, 220px tall]  │ │
│ └──────────────────────────────────┘ │
│ ┌ Estimated body change (estimate) ┐ │
│ │ [diverging bars, 140px]          │ │
│ └──────────────────────────────────┘ │
│ ┌ Macros per day ──────────────────┐ │
│ │ [stacked bars 220px]             │ │
│ └──────────────────────────────────┘ │
```

**Mobile: Body**

```
│ [ Today ] [ Trends ] [●Body ] [ Meals ]│
│ ┌──────────────────────────────────┐ │
│ │ 82.7 kg              Logged Nov 8│ │  hero
│ │ −1.4 kg over 61 days · −0.16/wk  │ │
│ │ 4.7 kg to target · ~Mar 14       │ │
│ └──────────────────────────────────┘ │
│ ┌──────────┬──────────┐              │  stats grid 2 cols
│ │ BMI 26.1 │ HEALTHY  │              │
│ │Overweight│58.6–78.9 │              │
│ ├──────────┼──────────┤              │
│ │RESTING   │EST. BURN │              │
│ │1,780 kcal│2,310 today│             │
│ └──────────┴──────────┘              │
│ ┌ Weight · last 90 days ───────────┐ │
│ │ [line + target + healthy band]   │ │
│ └──────────────────────────────────┘ │
│ ▸ Body details (auto-open if missing)│
```

**Mobile: Meals**

```
│ [ Today ] [ Trends ] [ Body ] [●Meals]│
│ Oct 11 – Nov 9          [7│30│90]    │
│ MON, NOV 9 ─────── 1,240 kcal        │  sticky-ish day header (not sticky required)
│   P 92 · C 130 · F 41 · Fib 18       │
│ ┌──────────────────────────────────┐ │
│ │ 12:40  Lunch            610 kcal │ │
│ │ Chicken bowl, rice, salsa        │ │  description wraps, never truncates
│ │ P 48  C 62  F 18  Fib 7  Sug 6   │ │
│ └──────────────────────────────────┘ │
│ …                                    │
│ Showing the 50 most recent meals in  │
│ this range.                          │
```

**Desktop (1440px): Today and Trends.** Body and Meals follow the §4.4 table; Meals
uses a table with columns Time, Meal, Description, kcal, P, C, F, Fib, Sug.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Nutrition  Mon, Nov 9 · America/New_York   [Today|Trends|Body|Meals]  ◐  ⇥   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ ring + trio ───────────────────────┐ ┌ Last 7 days ─────────── See trends› ┐│
│ │ (ring)  1,240 / 1,805 kcal         │ │ [7 bars w/ goal ticks, labelled]    ││
│ │ EATEN 1,240 │ BURN 2,310 │ Δ −139 g│ └─────────────────────────────────────┘│
│ └────────────────────────────────────┘ ┌ Today's meals ─────────────────────┐│
│ ┌ Nutrients ─────────────────────────┐ │ 08:10 Breakfast  Oats…   420 P32…  ││
│ │ Protein / Carbs / Fat / Fiber bars │ │ 12:40 Lunch      Chick…  610 P48…  ││
│ └────────────────────────────────────┘ └─────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘

Trends (desktop)
│ Oct 11 – Nov 9 · 30 days                                         [7│30│90] │
│ [DAILY AVG] [AVG PROTEIN] [OVER GOAL] [NET EST. CHANGE]                      │
│ [Calories per day — full width, 280px]                                       │
│ [Estimated body change — full width, 160px]                                  │
│ [Macros per day — full width, 280px]                                         │
```

### 4.6 Component anatomy

- **Header.**
    - Left: `h1` "Nutrition", with a sub line `{longDay(endDate)} · {timezone}`. On load
      failure the sub line reads "Could not load data. Is the server running?" with a
      Retry button.
    - Right: icon buttons, each 44×44, with `aria-label`:
        - Theme: a sun/moon inline SVG. Its label is "Switch to dark theme" or "Switch to
          light theme".
        - Sign out: label "Sign out". Show the text label at ≥ 481px.
- **Tab bar** (`role=tablist`, `aria-label="Dashboard sections"`).
    - Each tab is a `<button role=tab id=tab-today aria-controls=panel-today aria-selected>`.
    - Each tab has an inline SVG icon (`aria-hidden`) and a text label: "Today",
      "Trends", "Body", "Meals".
    - Selected state: `--accent-soft` pill fill, `--ink` label at weight 650, a 3px
      `--accent` bar under the label, and the icon in `--accent`. The bar and the weight
      are the non-colour cues.
    - Unselected: `--muted` label.
    - Minimum target 44×44.
    - Panels are `<section role=tabpanel id=panel-today aria-labelledby=tab-today tabindex=0>`.
      Every panel is in the DOM; inactive panels are `hidden`.
- **Range control** (Trends and Meals panel headers only).
    - A segmented `role=group aria-label="Date range"` with buttons "7 days",
      "30 days", "90 days" and `aria-pressed`.
    - Outline `--control`. The pressed segment gets `--accent-soft` fill, `--ink` text
      at weight 650 and a 1px `--accent` inner border.
    - Next to it is a range label: `{shortDay(startDate)} – {shortDay(endDate)}`.
    - One shared state: changing it in either panel updates both.
- **Calorie ring** (Today).
    - SVG, 168px (≤480: 148px), stroke 14, track `--surface-2`.
    - Arc = `min(eaten/goal, 1)` in `--kcal`, starting at 12 o'clock with round caps.
    - If over: a second arc from 0 to `min((eaten−goal)/goal, 1)` laid on top in `--over`
      with the hatch pattern, plus an ▲ glyph in the foot.
    - Centre: `fmt(eaten)` (hero), "of {fmt(goal)} kcal" (small, `--muted`).
    - Foot: "{left} kcal left" or "{over} kcal over" (the over case in `--over` with
      weight 650), then " · {base} + {active} active" when `active_kcal` is set.
    - No goal: the full track only, the centre shows eaten, and the foot reads "No
      calorie goal set — ask Claude to set one."
    - `role=img` with `aria-label`, e.g. "1,240 of 1,805 kcal eaten today, 565 left".
- **Energy trio** (Today). Three cells: EATEN kcal; EST. BURN kcal; EST. CHANGE ±N g.
    - The change cell gets a `--gain`/`--loss` swatch dot plus its sign.
    - The foot reads "so far · estimate", and the label carries "est.".
    - Without burn data, burn and change show "—" with the foot "Add body details" as a
      link-button that switches to the Body tab and opens and focuses the form.
    - With nothing eaten, change shows "—" and the foot "Nothing logged yet".
- **Nutrient bar row.**
    - Layout: label (ink), "value / goal g" (tabular, muted), and an 8px track
      (`--surface-2`) filled in that nutrient's token.
    - Over goal: the fill caps at 100% and an `--over` "over" chip is appended
      (text + colour).
    - No goal: show the value only and no track.
    - Goals: protein = `goal_protein_g`, carbs = `goal_carbs_g`, fat = `goal_fat_g`
      (all per-day, activity-adjusted), fiber = `goals.fiber_g`.
- **Mini 7-day strip.**
    - Seven bars of calories with a short goal tick per bar in `--muted`. Over-goal bars
      get the hatch.
    - Today's bar is 0.6 opacity with a "so far" label in the tooltip.
    - Day initials sit under the bars.
    - The whole card is a link-button "See trends ›" to `#trends`.
- **Stat card** (Trends tiles, Body stats). Uppercase micro label (`--muted`), figure
  plus unit, and a foot. A missing state shows the figure "—" in `--subtle` with an
  action foot.
    - **Trends tiles:**
        - Daily average: avg kcal over logged days; foot "L of N days logged".
        - Avg protein: average of `protein_g` over logged days, in g; foot "goal {g} g"
          when a goal exists.
        - Over goal: "{k} of {complete days with a goal} days". This counts only
          **complete** days, excluding `in_progress`.
        - Net est. change: the sum of `balance_g` over complete logged days, signed;
          foot "over {n} complete days · estimate". Show "—" without burn data.
- **Charts (shared).**
    - The card title has its note below in `--t-small` `--muted`. The legend uses
      swatches plus ink text and has shape cues: square = bar, line = goal, hollow
      circle = burn, hatched square = over.
    - **Calories:** each bar is drawn in `--kcal` up to `min(eaten, goal)`. The part
      above the goal is a separate segment filled with `url(#hatch-over)`: `--over`
      diagonal 45° stripes over a lighter `--over` tint. All patterns (`#hatch-over`)
      live in ONE shared `<svg width="0" height="0" aria-hidden="true"
style="position:absolute">` `<defs>` placed directly in `<body>`, outside every
      panel. A `<pattern>` inside a `hidden` (`display:none`) panel fails to paint, and
      per-chart copies would duplicate the id. The ring and the mini strip reference the
      same pattern.
    - Goal: a 2px `--muted` step line, end-labelled "Goal N".
    - Burn: a hollow circle (r 4, stroke 2 `--burn`, fill `--surface`).
    - The in-progress day is drawn at 0.6 opacity.
    - **Body change:** diverging bars, gain up in `--gain`, loss down in `--loss`. The
      zero line is `--muted` with a "0 g" label. Bars are direct-labelled when there
      are ≤14 bars. The title carries "(estimate)".
    - **Macros:** stacked, with only the top segment rounded and a 2px gap.
    - **Weight:** time-scaled, keeping all existing semantics (§1.1 W). The line is
      `--accent` with dots. The target is a dashed `--muted` line (dashed because it is
      a reference, not data) labelled "Target x". The healthy band is `--accent-soft`.
- **Meal card / row.**
    - Row 1: time `HH:MM` in the profile timezone + meal type (capitalised; "Meal" if
      null) on the left, kcal on the right.
    - Row 2: the description (wraps, escaped).
    - Row 3: "P n C n F n Fib n Sug n" in tabular `--muted`. Show each value only when
      it is not null; a null renders as "—".
    - Day header: "MON, NOV 9" plus the day total kcal and P/C/F, computed from the
      meals in the list. If the oldest group may be cut by the 50 cap, add a "partial"
      hint, e.g. "(partial — older meals not shown)" on the last group when
      `meals.length === 50`.
- **Body details form.** All the existing fields, rules and payload, inside
  `<details>`.
    - Inputs are 44px tall and 16px font. Labels sit above the inputs.
    - Save is a primary button (`--accent`/`--accent-ink`).
    - The status line keeps `role=status`.
    - It auto-opens when `missing` includes height, birth_date or sex.

### 4.7 Behaviour and states

- **Pre-paint theme:**
    - The first child of `<head>` after `<meta charset>` is an inline script that reads
      `nutrition-dash-theme` (with try/catch) and sets `data-theme` before CSS parses.
    - Add `<meta name="color-scheme" content="light dark">`.
    - Remove the late theme application.
- **Charts render at real pixel width:**
    - Use the SVG `width = host.clientWidth`, a fixed height (in px per chart), and a
      `viewBox` equal to those pixel dimensions, so text is truly 12px.
    - Use one `ResizeObserver` on the panel container, debounced with
      `requestAnimationFrame`. Re-render only the visible panel.
    - When a panel is shown for the first time after a resize, render it then.
    - x-label density = `floor(plotW / 56)` labels.
    - At 90 days on 358px the bars are ~3px with no gap. That is acceptable.
- **Tooltip / inspect:**
    - Use Pointer Events. `pointermove` with `pointerType=mouse` shows a hover tooltip.
    - `pointerdown` with touch or pen **pins** the tooltip for that column and draws a
      1px `--muted` vertical guide.
    - Tapping elsewhere, pressing Esc or scrolling dismisses it.
    - Each chart `<svg>` is `tabindex=0`, `role=img` with a summary `aria-label`.
      Left/Right step a focus column, which shows the tooltip at the column, and the
      same text goes to a visually hidden `aria-live=polite` region. Home/End jump to
      the first/last column, and Esc clears.
    - Tooltip content keeps every field of the §1.1 tooltips. Calories adds "Over by N"
      when over.
    - Tooltip position is clamped inside the viewport, including on a 390px screen.
- **Hover/active:** cards don't move. Buttons get `--surface-2` on hover and a 0.98
  scale on `:active` (none under reduced motion). The cursor is a pointer only on
  interactive elements.
- **Focus-visible:** `outline: 2px solid var(--focus-ring); outline-offset: 2px` on
  every interactive element, including tabs, segments, chart svgs and the summary.
  Never set `outline: none` without this replacement.
- **Disabled:** while a range fetch is in flight, the segments are
  `aria-disabled="true"` and the pressed segment shows a 12px spinner. Clicks are
  ignored.
- **Loading skeleton:**
    - On the first load, and on a range change, panels show shimmer blocks shaped like
      their cards: `--surface-2` with a 1.2s linear gradient sweep, static under reduced
      motion.
    - Keep the previous data visible, dimmed to 0.6, during a range refetch rather than
      blanking.
- **Empty states** (real micro-copy):
    - Today, no meals: "Nothing logged yet today. Tell Claude what you ate and it will
      show up here."
    - Trends, no logged days: "Nothing logged in these {N} days."
    - Body, no weigh-ins: "No weigh-ins yet. Ask Claude to log your weight."
    - Body, missing details: "Add your height, birth date and sex to see BMI and
      estimated burn." The form auto-opens.
    - Meals: "No meals logged in this range."
    - No goals at all: the ring shows eaten only, and the foot reads "No calorie goal
      set — ask Claude to set one."
- **API error:** a dismissable banner at the top of the active panel ("Could not load
  data. Is the server running?") with a Retry button that refetches. A 401 anywhere
  calls `signOut()`.
- **Body save states:** idle → "Saving…" (button disabled) → "Saved." (fades after
  4s) or the error text in `--over`. On success, refetch.
- **Login:** all the existing states and copy. The submit button is disabled while
  pending.
- **Timezone correctness:**
    - Every meal time and date is rendered with
      `Intl.DateTimeFormat(undefined, {timeZone: data.timezone, …})`.
    - "Today's meals" filters on
      `Intl.DateTimeFormat("en-CA", {timeZone: data.timezone, year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date(m.logged_at)) === data.endDate`.
    - Wrap it in try/catch and fall back to the browser zone if the tz is invalid.

### 4.8 Motion

| Event          | Effect                                       | Duration | Easing                      |
| -------------- | -------------------------------------------- | -------- | --------------------------- |
| Tab switch     | panel opacity 0→1, translateY 4px→0          | 160ms    | `cubic-bezier(.22,1,.36,1)` |
| Ring on render | stroke-dashoffset sweep                      | 500ms    | same                        |
| Nutrient bars  | width 0→value                                | 400ms    | same                        |
| Tooltip        | opacity                                      | 100ms    | linear                      |
| Tab indicator  | none (instant), to avoid motion on every tap | —        | —                           |

Under `prefers-reduced-motion: reduce`, every transition and animation is `none` and
skeletons are static. Charts never animate bar heights on a range change.

### 4.9 Accessibility

- Tabs follow APG with **automatic activation**, which is fine because all panels are
  in the DOM:
    - Left/Right move between tabs and wrap. Home/End jump to the first/last tab.
    - Tab moves focus into the active panel.
    - Selecting a tab sets `location.hash` (a history entry per tab change), so
      back/forward moves between tabs. Do not scroll on the hash change: the panels
      have ids `panel-*`, not `today` etc., so the browser has no anchor to jump to.
    - The `hashchange` event (back/forward) selects the matching tab. Focus is not moved
      on a hash-driven change.
- Landmarks: `<header>`, `<nav>` wrapping the tablist, `<main>` holding the panels.
  Each panel has an `h2` (visually hidden is fine) naming the tab.
- On sign-in success, focus the Today tab. On sign-out, focus the email field.
- Every chart has a text alternative: a summary `aria-label` plus keyboard stepping.
  Every plotted figure also appears as text somewhere: tooltips, stat cards, meals.
- Colour is never the only cue (see §4.2 rules). The BMI category is text. Over goal
  is text plus hatch. Gain/loss is sign plus direction.
- Targets are ≥ 44×44 on touch. There is no horizontal page scroll. The layout holds
  at 200% zoom.
- axe: zero serious or critical violations. Lighthouse accessibility ≥ 95.

### 4.10 Nice-to-haves (not required for acceptance)

- **N1:** Today shows Sugar (a limit: "under {goals.sugar_g} g", over = chip) and Water
  (`waterMl` vs `goals.water_ml`, shown in L when ≥ 1000 ml) as extra nutrient rows,
  only when a goal exists or the value is > 0.
- ~~**N2:** a "1 year" range segment (`days=365`).~~ Promoted to required (§0).
- **N3:** a per-chart "Show as table" disclosure.
- **N4:** swipe left/right between tabs on touch, which must not conflict with chart
  inspect.
- **N5:** a Trends fiber/water small-multiple chart.

### 4.11 Estimate vs reality (required, user request 2026-11-09)

The user wants to see, for the selected period, the **estimated** grams gained or
lost (from eating vs estimated burn) next to what the **scale actually did**, so the
estimate can be trusted — or corrected. It lives on **Trends** as a card directly
under "Estimated body change", and its headline also appears as the "Net est.
change" summary tile's foot ("scale: −0.6 kg").

**Where it is computed: server-side, as one additive payload field.** The page is a
single hand-written file with no build step, so it cannot import a tested module.
Add `buildEstimateVsScale(dayRows, weighIns, startDate, endDate)` to
`src/dashboard-stats.ts` (pure, beside `buildWeightStats`, unit-tested in
`src/dashboard-stats.test.ts`) and return it as `estimateVsScale` in the
`/api/dashboard/data` payload — `null` fields where the states below say so. This is
the one allowed additive API change beyond §5; the existing fields stay untouched.
The preview fixture must produce it through the same function. Inputs it uses:
the built `daily` rows (`date`, `balance_g`, `in_progress`) and the weigh-ins
(`date`, `weight_g`; the server window is `max(days, 90)`, so it covers every range
including 365). The page only renders the result.

**Computation:**

1. Scale span: the first and last weigh-ins whose `date` falls inside
   `[startDate, endDate]`. Need **≥ 2 weigh-ins on different dates**; otherwise show
   the empty state "Log your weight at least twice in this period to compare —
   ask Claude to log a weigh-in".
2. `actual_g = last.weight_g − first.weight_g` over `span_days = last.date − first.date`.
3. Estimated over the **same span**: days `d` with `first.date ≤ d < last.date`
   (the morning weigh-in on the last day precedes that day's eating). Sum
   `balance_g` over those days that have one and are not `in_progress` →
   `est_logged_g`, over `covered_days` of `span_days`.
4. If `covered_days < span_days`, also show `est_scaled_g = est_logged_g ×
span_days / covered_days`, labelled "if unlogged days were similar". Never show
   only the scaled figure.
5. `gap_g = actual_g − est_scaled_g` (or `est_logged_g` when fully covered).
   `implied_kcal_per_day = −gap_g × 7.7 / span_days`.
    - Positive → the burn estimate runs **high** by that many kcal/day (you lost less
      than predicted); negative → it runs **low**.
6. Only state the calibration sentence when `span_days ≥ 14` **and**
   `covered_days / span_days ≥ 0.7`; otherwise say "Not enough logged days yet to
   judge the estimate (need 2+ weeks, 70% logged)". Short spans are dominated by
   water and glycogen swings — say so in the card's note.

**Display**

- Two horizontal bars on a shared zero axis (same diverging style as §4.6's body
  change band, `--gain` / `--loss` with +/− sign text): "Estimated" and "Scale".
  If scaled, a third faint bar "Estimated (all days)".
- Weight values in the user's `weightUnit` (g → kg/lb, one decimal; show grams when
  |value| < 1 kg).
- Below: "Period: {first.date} → {last.date} · {span_days} days · {covered_days}
  logged" and the calibration sentence, e.g. "Your scale lost 0.4 kg less than
  estimated — the burn estimate looks ~150 kcal/day high. (It assumes BMR × 1.2 +
  Garmin active kcal.)"
- Everything labelled as an estimate; colour never the only cue.

**Preview fixtures** (§5.2): add scenario `calibrate` — 45 days, ~90% logged,
weekly weigh-ins drifting so the implied offset is ~+150 kcal/day — and make sure
`full` has ≥ 2 weigh-ins in the default 30-day range. `no-body` must show the
"needs body details" state (no `balance_g` at all).

---

## 5. Architecture requirements

### 5.1 Files

- `public/dashboard.html`: rewritten in place. It stays one file, tracked in git, and
  `bun run format` (Prettier) applies to it.
- **API:** unchanged. No new endpoints.
- **`src/dashboard.ts`** gets one additive, behaviour-preserving refactor:
    - Export `buildDashboardPayload(inputs: DashboardInputs)`, where
      `DashboardInputs = { profile: Profile|null; meals: Meal[]; water: WaterEntry[]; weight: WeightEntry[]; goals: NutritionGoals|null; latestWeight: WeightEntry|null; activityRows: ActivityDay[]; days: number; today: string }`.
    - It contains everything `dashboardPayload` does after the `Promise.all`, including
      the tz/unit derivation and the `startDate`/`weightStart` computation from `today`.
    - `dashboardPayload` computes `today = todayInTz(tz)`, fetches, then returns
      `buildDashboardPayload(...)`.
    - The existing `dashboard API` tests in `src/mcp.test.ts` must pass unmodified.
- **New `scripts/dashboard-preview.ts`** (dev only, never mounted by `src/index.ts`).
    - It imports `buildDashboardPayload` and `checkBodyPatch`. Importing `src/dashboard.ts`
      is safe without env, because `getSupabase()` is lazy.
    - It must never call any Supabase function. Assert this by running it with
      `SUPABASE_URL`/`SUPABASE_SECRET_KEY` unset.
- **`package.json`:** add `"dashboard:preview": "bun --watch scripts/dashboard-preview.ts"`.
- **Drift guard:** a new test (e.g. `src/dashboard-preview.test.ts`, or inside the
  existing `dashboard API` describe in `mcp.test.ts` — follow CLAUDE.md's mock-window
  rule) asserts the deep key set of the preview's `full` scenario payload equals the
  deep key set of `dashboardPayload("u1", 30)` from the shared mock. It also
  validates that every scenario produces `daily.length === days` with the last row
  `in_progress`, and that every `meals[].logged_at` and `weights[].date` falls
  inside its window, for days = 1, 7, 30 and 90.
    - If the fixture generator lives in `scripts/`, it is out of typecheck scope.
      Either move it into `src/dashboard-fixture.ts` (pure; recommended) or make sure
      the test imports it.

### 5.2 Preview server spec (`bun run dashboard:preview`)

- `Bun.serve` on `DASHBOARD_PREVIEW_PORT`, default **8791**. Avoid 8090 (local
  docker), 8787 (widget harness) and 8080. Print the URL on start.
- `GET /` and `GET /dashboard`:
    - Read `public/dashboard.html` **fresh on every request**, so the user edits and
      refreshes.
    - Respond with the **same `Content-Security-Policy` string** as `src/index.ts`, plus
      `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`, so CSP violations show
      up in preview.
    - If the query has `scenario=`, `delay=` or `fail=`, store them in server memory
      (single-user dev tool) before serving.
- `POST /api/dashboard/login`: any non-empty email and password returns
  `{access_token:"preview-token"}`. Email `429@test` returns 429 and `bad@test`
  returns 401, so login error states are reviewable.
- `GET /api/dashboard/data?days=N`:
    - Require `Authorization: Bearer preview-token`, else 401.
    - Clamp N to 1–365.
    - Build the payload with `buildDashboardPayload` from the current scenario's
      synthetic inputs, with `today` = the real current date in the scenario tz.
      Before the call, filter the synthetic rows to the windows production queries
      apply: meals, water and activity to `[startDate, endDate]`, and weights to
      `[weightStart, endDate]` (local dates in the scenario tz). `latestWeight` is the
      newest weigh-in overall. Otherwise a 120-day fixture would leak weeks-old meals
      into `days=7`.
    - Apply `delay` ms. `fail=500` returns 500 and `fail=401` returns 401.
- `POST /api/dashboard/body`: validate with `checkBodyPatch` and return the same
  shapes as `saveBodyDetails`. Update the in-memory profile only.
- **Scenarios** (deterministic, seeded PRNG, generated relative to today):

    | name             | content                                                                                                                                                                                                                                                                                                                                  |
    | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `full` (default) | tz `America/New_York`, unit `kg`, goals 1800 kcal / 140 P / 180 C / 60 F / 30 fib / 50 sugar / 2500 ml water / target 78 kg. 120 days of 2–4 meals/day with ~10% unlogged days and ~20% over-goal days. Activity 0–600 kcal on most days. Weigh-ins every 1–4 days trending −0.15 kg/wk from 84 kg. Body details set. Today has 2 meals. |
    | `over-goal`      | `full`, but today is 300 kcal over and 5 of the last 7 days are over.                                                                                                                                                                                                                                                                    |
    | `no-body`        | `full` without height/birth_date/sex (no burn, no BMI; the form auto-opens).                                                                                                                                                                                                                                                             |
    | `no-goals`       | `full` with `goals = null`.                                                                                                                                                                                                                                                                                                              |
    | `empty`          | a profile with a tz only: no meals, no weights, no goals, no activity.                                                                                                                                                                                                                                                                   |
    | `lb`             | `full` with `preferred_weight_unit: "lb"` and tz `Asia/Tokyo` (exercises the tz filter and the in/lb paths).                                                                                                                                                                                                                             |

- Usage: open `http://localhost:8791/dashboard?scenario=no-body`, then sign in with
  any email and password. Switch scenarios by changing the query and reloading.

### 5.3 Real-data preview

The user's `.env` is present in the worktree. Run:

```
DASHBOARD_ENABLED=true PORT=8792 bun --watch src/index.ts
```

then open `http://localhost:8792/dashboard`.

- Do **not** use `bun run dev`: it runs `gen:all` and rewrites `public/`.
- Side effects are limited to:
    - one access-token row per sign-in;
    - profile updates if the Body form is submitted, which the implementer must not do
      against real data.
- The implementer verifies against real data read-only.

### 5.4 Prod and promotion

- No Dockerfile or compose change. The route is unchanged.
- Promotion is the user's call: merge to `main`, then `docker compose up -d --build`
  on the Asus.
- Merging to `main` also auto-deploys the public DigitalOcean instance (CLAUDE.md),
  but the dashboard stays off there unless `DASHBOARD_ENABLED=true`.

### 5.5 Migration order

The page is a single file, so this is one rewrite, done in commits on this worktree
branch in this order:

1. Refactor plus preview server and fixture, with the drift test.
2. Tokens, header, tab shell, routing and pre-paint theme.
3. Today.
4. Trends (port the charts to real-px rendering plus pointer tooltips).
5. Body.
6. Meals.
7. Polish (skeletons, motion, a11y pass) and screenshots.

The old page is not kept side by side. Git history is the fallback.

---

## 6. Acceptance criteria

- [ ] **§0 decisions honoured:** 1-year range on Trends and Meals; §4.11 "Estimate vs
      reality" card on Trends (empty state, coverage line, scaled figure only
      alongside the logged one, calibration sentence gated on ≥ 14 days and ≥ 70%
      logged); its maths in a pure helper with unit tests (fully covered span,
      gappy span, < 2 weigh-ins, sign of the implied offset); `calibrate` preview
      scenario; review screenshots committed to `docs/redesign/screenshots/`.
- [ ] **Feature parity:** every item in §1.1 (fields, copy semantics, states, 401/429
      handling, auto-open form, "est." labels, in-progress handling, net change over
      complete days, projection copy variants) exists in the new UI. Walk the table
      row by row and tick each.
- [ ] Four tabs (Today, Trends, Body, Meals) following the APG pattern. Hash deep
      links work (`#body` on load opens Body). Back/forward switches tabs. The range
      persists across reloads. Today and Body have no range control.
- [ ] Palette tokens exactly as §4.2 (or changed with the contrast table updated),
      declared for light, `prefers-color-scheme: dark`, `[data-theme="dark"]` and
      `[data-theme="light"]`. The in-page toggle wins in both directions. No theme
      flash on reload in dark mode.
- [ ] Colour is never the sole cue: over goal has a hatch plus text, gain/loss has a
      sign plus direction, and the selected tab has an indicator bar plus weight.
- [ ] Every estimate (burn, change, net change, resting burn, projection) is labelled
      "est."/"estimate".
- [ ] At 390px: no horizontal page scroll on any tab or scenario, chart text renders
      ≥ 12px (check the computed size), tap-to-pin tooltips work, the meals render as
      cards, and inputs are 16px.
- [ ] Meal times and today's-meal filtering use `data.timezone`. Verified with the
      `lb` scenario (Asia/Tokyo) in a browser set to another zone.
- [ ] Zero network requests to any origin other than the page's own (Playwright
      request log). Zero CSP violations and zero console errors or warnings in every
      scenario and both themes.
- [ ] axe-core: zero serious/critical violations on each tab, in both themes, in the
      `full` and `empty` scenarios. Lighthouse accessibility ≥ 95.
- [ ] `bun test`, `bun run typecheck` and `bun run format:check` are all green. The
      existing `dashboard API` tests pass unmodified. The new drift-guard test passes.
- [ ] `bun run dashboard:preview` starts with Supabase env vars unset and serves every
      scenario in §5.2. `?delay=2000` shows skeletons. `?fail=500` shows the error
      banner and Retry. `?fail=401` returns to login.
- [ ] E2E (Playwright, via `bunx`, run against the preview; the script lives in
      `scripts/` and is not part of `bun test` unless it is fast and hermetic): log
      in, visit each tab, change the range, save the Body form (preview only), sign
      out.
- [ ] The real API was checked read-only at `DASHBOARD_ENABLED=true PORT=8792`: each
      endpoint returns valid JSON and the page renders. No Body form submission and no
      other mutation of protected data.
- [ ] Screenshots at 390×844 and 1440×900, light and dark, for Today, Trends, Body,
      Meals and Login, from the `full` scenario plus `empty` for Today. Saved under
      `docs/redesign/screenshots/`. Optional: commit them, or leave them uncommitted
      for review.
- [ ] Nothing outside the allowed files changed (`git diff --stat` is limited to
      `public/dashboard.html`, `src/dashboard.ts`, the new script, the fixture, tests,
      `package.json` and `docs/redesign/`).
- [ ] The user has reviewed the localhost preview before any promotion to the Asus.

---

## Sources

- MacroFactor, "Welcome Home, Data: Dashboard Customization" (2024-11-20): https://macrofactor.com/dashboard-customization/
- Cronometer, Energy Summary redesign (2025-01-13): https://cronometer.com/blog/sp-2
- DC Rainmaker, Garmin Connect mobile revamp walkthrough (2024-01): https://www.dcrainmaker.com/2024/01/garmin-connect-mobile-revamp-walk-through.html
- Android Central, Garmin Connect beta redesign (2024): https://www.androidcentral.com/wearables/garmin-connect-beta-redesign-is-long-overdue
- iMore, Health app guide: https://www.imore.com/health-ios
- MacRumors, Health Trends (2021, foundational): https://www.macrumors.com/2021/06/07/apple-unveils-new-health-app-features/
- Apple HIG, Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Apple HIG, Tab views: https://developer.apple.com/design/human-interface-guidelines/tab-views
- W3C WAI-ARIA APG, Tabs pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- Bun docs, Standalone HTML (2026): https://bun.com/docs/bundler/standalone-html
- web-features explorer, color-mix(): https://web-platform-dx.github.io/web-features-explorer/features/color-mix
- Anthropic `frontend-design` skill listing: https://skills.sh/anthropics/claude-plugins-official/frontend-design
- In-repo: `public/widgets/STYLE_GUIDE.md` (series palette), `public/styles.css` (brand green, forest dark), CLAUDE.md "Personal dashboard".
