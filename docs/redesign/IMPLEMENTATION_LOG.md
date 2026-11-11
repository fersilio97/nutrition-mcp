# Dashboard redesign, round 3: implementation log (visual re-skin)

Branch `dashboard-redesign-labucu`. Spec: `docs/redesign/REQUIREMENTS.md` (approved
2026-11-10). Round 1–2 history: `docs/redesign/archive/round-2/`.

## How to look at it

- Fixture preview: http://localhost:8791/dashboard (any email and password).
  Scenarios `?scenario=full|over-goal|no-body|no-goals|empty|lb|calibrate`, failure
  modes `?delay=2000`, `?fail=500|401`.
- E2E: `DASHBOARD_PREVIEW_PORT=8793 bun scripts/dashboard-preview.ts`, then
  `PW_DIR=/tmp/dash-tools bun scripts/dashboard-e2e.ts http://localhost:8793`
  (Playwright + axe installed outside the repo, see the archive log).

## 1. Baseline (unmodified page, commit `99802e5`)

E2E against a fresh preview on 8793, before any edit: **2 FAILED**, 167 ok. Both
failures are the known red check (REQUIREMENTS §1.4):

```
round 1 · 390px   FAIL Today shows the 7-day scale + net estimate pair
round 1 · 1440px  FAIL Today shows the 7-day scale + net estimate pair
```

Cause: the check reads `#today-body .trio.two`, but since §0c the page renders the
7-day figures as a three-cell `<div class="trio">`. No other check was red.

## 2. Fonts

Downloaded once with `curl` from the URLs in §4.2.1. Sizes and sha256 match the
requirements exactly, so the `v9`/`v4`/`v6` names stand:

| File                                 | Bytes  | sha256                                                             |
| ------------------------------------ | ------ | ------------------------------------------------------------------ |
| `bricolage-grotesque-latin-v9.woff2` | 76,868 | `85f55a58a31e61a2e19e8bb25fed503181bf2a6b4cab76c589992cfaac377447` |
| `instrument-sans-latin-v4.woff2`     | 29,904 | `6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311` |
| `geist-mono-latin-v6.woff2`          | 23,108 | `5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b` |

OFL texts: 4,403 / 4,403 / 4,387 bytes. Each declares no Reserved Font Name (the
only match for the phrase is the licence's own definition paragraph).

Production CSP check (in-process, not committed: `DASHBOARD_ENABLED=true`, Supabase
env blanked, `app.request("/dashboard")`): status 200 and the header equals
`DASHBOARD_CSP`; `/dashboard-fonts/geist-mono-latin-v6.woff2` is 200 `font/woff2`;
the landing page still sends the default CSP. The preview sends the same string.

## 3. Style tile (before any view)

`/tmp/style-tile.html` (not committed) uses the page's real stylesheet with the three
woff2 files loaded by `file://` path. Playwright confirmed `Bricolage Grotesque`,
`Instrument Sans` and `Geist Mono` all `loaded` in both themes. Screenshots:
`screenshots/style-tile-{light,dark}.png`, compared with
`screenshots/reference-facts-{light,dark}.png` and `reference-features-dark.png`.

First shot found three foundation bugs, fixed before any view was built:

- Facts `.sub` rows rendered in uppercase mono → the header's `.sub` rule (for `#sub`)
  matched them too → scoped it to `.brand .sub` → re-shot, sub rows are Instrument
  `--ink-2` sentence case.
- Units sat a full gap away from figures ("1,904 kcal") → `dd` was an inline-flex
  with `gap: 8px` → `dd` is a plain block, chips get their own margin → re-shot.
- The Calories row wrapped (ring + label on one line, figure alone below) in the 5fr
  column → `flex-wrap` with three items in ~360px → the ring spans two grid rows at
  every width, label top-right, figure bottom-right → re-shot, one compact block.

| Criterion    | Score | Evidence                                                                                                    |
| ------------ | ----- | ----------------------------------------------------------------------------------------------------------- |
| Typography   | 5     | Bricolage 800 "Today"/"1,240" at −0.035/−0.045em, Instrument body, Geist eyebrows; all three `loaded`.      |
| Colour       | 4     | Paper `#fbfbf9` / forest `#0d1210`; amber kcal, earthy series; no stock hexes. Light amber is a touch dull. |
| Motif        | 5     | 1px title rule, 10px bar, 5px rule, 10px Nutrients bar, 5px foot rule, 3px section rules: the label itself. |
| Hierarchy    | 4     | One hero figure; strip is a ruled grid, not tiles; chart printed on the paper under a 3px rule.             |
| Detail       | 4     | Tabular figures, muted small units, real minus, chip "over" + hatch, hover/disabled/focus states shown.     |
| Side by side | 5     | Next to `reference-facts-light.png` the Today panel reads as the same label at the same weight.             |

## 4. What changed

| File                            | Change                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/dashboard.html`         | New stylesheet (§4.1 tokens in 3 blocks, self-hosted `@font-face`, type scale, rule hierarchy, motion). Login and every view re-marked: Today and Body as Facts panels (`<dl>` rows), 3px-rule section heads, ruled strips, printed charts, Meals day ledger. Behaviour and JS state untouched. |
| `public/dashboard-fonts/`       | 3 woff2 + 3 OFL texts.                                                                                                                                                                                                                                                                          |
| `src/dashboard.ts`              | `DASHBOARD_CSP`, `DASHBOARD_FONTS`, `dashboardFontResponse()`, and the unauthenticated font route inside `createDashboardRouter()`.                                                                                                                                                             |
| `src/index.ts`                  | Inside `dashboardEnabled()` only: `/dashboard` sends `DASHBOARD_CSP`.                                                                                                                                                                                                                           |
| `scripts/dashboard-preview.ts`  | `PREVIEW_CSP = DASHBOARD_CSP`; serves `/dashboard-fonts/*`.                                                                                                                                                                                                                                     |
| `src/dashboard-fixture.test.ts` | CSP test replaced by the §5.2 one (default + `font-src 'self'`, shared by prod and preview).                                                                                                                                                                                                    |
| `src/dashboard-fonts.test.ts`   | New: 200/`font/woff2`/immutable/byte length/`wOF2` per file, no auth; 404 for unknown, traversal and the OFL text; OFL beside each file. No `mock.module`.                                                                                                                                      |
| `scripts/dashboard-e2e.ts`      | §6.2 changes, listed below.                                                                                                                                                                                                                                                                     |

### E2E changes (§6.2)

- **Selector:** `#today-body .trio.two` → `#today-body [data-last7]` (the strip is now
  `<div class="trio strip three" data-last7>`). Same assertion. This was the red check
  at baseline.
- **Theme literals (deviation, see §7):** the three background checks expected the
  round-2 `--bg` (`rgb(243, 247, 244)` / `rgb(10, 19, 16)`). §4.1 sets `#fbfbf9` /
  `#0d1210`, so they now expect `rgb(251, 251, 249)` / `rgb(13, 18, 16)`. Same intent:
  the toggle wins both ways and the saved dark theme applies before first paint.
- **Added (a)(b)(c):** the three families `loaded` and computed families on the hero
  figure, body and a `.seg` button; the three woff2 files are 200 `font/woff2` from the
  page's own origin (read from Resource Timing, because they load with the page before a
  listener can attach); no overlapping `#cal-plot text.xl` boxes at 390px for 7, 30 and
  365 days.

### Bugs found during the build

- Empty state: "Add body details" overflowed its strip cell → `.link-btn` is
  `nowrap` → wraps inside strips → re-shot `today-empty-390-light.png`, fixed.
- Empty note sat flush under the strip → no margin between siblings → `.strip + .empty`
  gets `--gap-block` → re-shot.
- Tapping a chart (pins the tooltip) drew Chrome's blue `outline: auto` though the svg
  was not `:focus-visible` → UA focus style on a `tabindex` svg →
  `svg.chart:focus:not(:focus-visible) { outline: none }` → computed outline `none` after
  a tap, keyboard focus keeps `--focus-ring` (checked in Playwright).
- First font check in the E2E saw zero responses → fonts load during `goto()` before
  the listener attaches → Resource Timing + direct header fetch → green.
- Day totals in Meals read "1,240kcal" to a screen reader after a styling change → the
  space was dropped from the text → restored the real space, removed the margin.

## 5. Results

- `bun test`: **959 pass, 0 fail** (35 files).
- `bun run typecheck`: clean. `bun run format:check`: clean.
- E2E (`scripts/dashboard-e2e.ts` on a fresh preview at 8793): **181 ok, 0 failed** on
  two consecutive runs, and again after the final CSS fixes (third run, 181 ok). That
  includes axe (no serious/critical) on every tab at 390 and 1440 in both themes, the
  `empty` scenario in both themes, and the meals editor.
- Motion (Playwright, Today first render): without emulation the running animations
  are `rv-fade, rv-rise, rule-draw, bar-grow, stroke-dashoffset, width, livepulse` and
  the hero counts up; with `reducedMotion: "reduce"` every duration is `1e-05s`, blocks
  are at opacity 1, the figure is final ("1,240") and the pulse is off.
- Glyphs: `perl -CSD` grep for `→ ▲ ≥ ● U+202F U+2009` outside comments: no hits in UI
  strings (one hit inside a CSS comment). The three `→` became `–`/`›` and `▲` became
  the inline SVG triangle.

## 6. Design-quality scores (against `reference-facts-{light,dark}.png`)

Final screenshots: `screenshots/{login,today,trends,body,meals}-{390,1440}-{light,dark}.png`,
plus `today-empty`, `today-over-goal`, `body-no-body`, `meals-edit`, `body-log-weight`
and `trends-tooltip` at 390 light. Every one was opened and looked at.

| View   | Type | Colour | Motif | Hierarchy | Detail | Motion | Side by side | Biggest remaining gap                                                                              |
| ------ | ---- | ------ | ----- | --------- | ------ | ------ | ------------ | -------------------------------------------------------------------------------------------------- |
| Login  | 5    | 4      | 5     | 4         | 4      | 4      | 5            | Plain by design (no motion beyond the button press); the panel is literally the reference's label. |
| Today  | 5    | 4      | 5     | 5         | 4      | 5      | 5            | The 7-day strip's labels wrap to two lines at 390 ("NET EST. / CHANGE").                           |
| Trends | 5    | 4      | 4     | 4         | 4      | 4      | 4            | Long notes make the 1440 head tall; the chart sits well below the title.                           |
| Body   | 5    | 4      | 5     | 5         | 4      | 4      | 5            | The weight chart's right column ends early at 1440, leaving open paper under it.                   |
| Meals  | 4    | 4      | 4     | 4         | 4      | 4      | 4            | At 1440 the day header's date (mono) and total (Bricolage) sit on slightly different baselines.    |

Evidence, one line each:

- **Login:** Facts panel with "Sign in" at 800, 1px rule, serving line, 10px bar, mono
  field labels, ink pill, 5px rule and footnote; centred is the one allowed exception.
- **Today:** "1,240" at `--fs-hero` beside the ring with "65%", Goal/Left/Est. burn/Est.
  change as `<dl>` rows with indented subs, 10px bar into "% of goal" rows with 4px
  tracks; over-goal shows the SVG triangle, "Over", chip and hatch (`today-over-goal`).
- **Trends:** ruled 4-cell strip, ENERGY/BALANCE/CALIBRATION/MACROS eyebrows in the
  180px column, 2px ink goal step with "GOAL 2,022" on a halo, slate burn rings and
  dashed resting line, square bars, two-line direct labels on Balance, Estimate vs
  reality as a ruled sub-panel with the 5px rule and mono period line.
- **Body:** "Weight" panel with "+ Log weight" pill, "81.7 kg" hero, six label rows,
  BMI category as text; the Log weight form opens as a ruled field grid under the 10px
  bar; Body details uses the FAQ "+" disclosure under a 3px rule.
- **Meals:** 3px rule per day, mono date, Bricolage day total, hairline rows, tabular
  right-aligned numbers, Edit pills; the editor is a ruled grid with the 2px accent inset.
- **Colour (all 4):** tokens exactly §4.1; forest dark verified on every tab; light
  `--kcal` is intentionally graphics-only and reads a little brown at small sizes.
- **Motion:** reveal, rule draw, bar grow, ring sweep and count-up present; the meals
  and login views only get the block rise, which is why they score 4.

No score is below 4, so no view needed rework after these shots; the three foundation
fixes in §3 and the bugs in §4 were made before scoring.

## 7. Acceptance checklist (§6.1, §6.3)

- [x] Feature parity: every round-2 string, state and action kept; scenarios
      `full/over-goal/no-body/no-goals/empty/lb/calibrate`, `?delay`, `?fail=500` banner +
      Retry and `?fail=401` exercised by the E2E. New strings only from §1.1's list.
- [x] E2E green on two consecutive runs; changes limited to §6.2 plus the theme literals.
- [x] `bun test`, `typecheck`, `format:check` green, incl. the new CSP and font tests.
- [x] Network: only same-origin requests (E2E `foreign request` guard in every scenario),
      three woff2 200 `font/woff2`, zero console errors/warnings in every scenario and
      both themes (E2E and the screenshot run).
- [x] Fonts render: all three `loaded`, computed families correct (E2E).
- [x] `/dashboard` carries `DASHBOARD_CSP` in production (in-process check) and preview.
- [x] Tokens exactly §4.1, in the light, media-dark and `[data-theme="dark"]` blocks;
      toggle wins both ways; no flash on reload (E2E).
- [x] 390px: no horizontal scroll on any tab/scenario, chart text ≥ 12px, no x-label
      overlap at 7/30/365, tabs 56px, inputs 16px, tap-to-pin works.
- [x] axe: zero serious/critical (E2E). **Lighthouse: not run** (see §8).
- [x] Estimates stay labelled; colour never the only cue (hatch + "over", sign +
      direction, underline + weight, BMI category text).
- [x] No protected data touched; only the fixture preview was used.
- [x] `git diff --stat` limited to the §0 files.
- [x] Reference, style tile and final screenshots in `docs/redesign/screenshots/`.
- [ ] The user reviews http://localhost:8791/dashboard before any promotion.

## 8. Deviations and known issues

- **E2E theme literals changed.** Not in §6.2's list, but they assert the old token
  values the approved §4.1 replaces; the intent of each check is unchanged.
- **Lighthouse accessibility not run.** It needs the session token in `localStorage`
  before load, which the CLI cannot set without a custom Puppeteer flow; axe covers the
  same rules and is green. Not verified, not claimed.
- **Claude in Chrome not used.** Visual QA, network and console checks were done with
  Playwright (Chromium) screenshots, Resource Timing and console capture instead.
- **Monthly x-labels** use `’25` (U+2019) rather than `'25`; the glyph is in all three
  fonts.
- Header sub line ("TUE, NOV 10 · AMERICA/NEW_YORK") ellipsizes at 390, as specified.
