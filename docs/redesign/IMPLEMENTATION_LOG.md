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
- Units sat a full gap away from figures ("1,904   kcal") → `dd` was an inline-flex
  with `gap: 8px` → `dd` is a plain block, chips get their own margin → re-shot.
- The Calories row wrapped (ring + label on one line, figure alone below) in the 5fr
  column → `flex-wrap` with three items in ~360px → the ring spans two grid rows at
  every width, label top-right, figure bottom-right → re-shot, one compact block.

| Criterion     | Score | Evidence                                                                                                    |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| Typography    | 5     | Bricolage 800 "Today"/"1,240" at −0.035/−0.045em, Instrument body, Geist eyebrows; all three `loaded`.      |
| Colour        | 4     | Paper `#fbfbf9` / forest `#0d1210`; amber kcal, earthy series; no stock hexes. Light amber is a touch dull. |
| Motif         | 5     | 1px title rule, 10px bar, 5px rule, 10px Nutrients bar, 5px foot rule, 3px section rules: the label itself. |
| Hierarchy     | 4     | One hero figure; strip is a ruled grid, not tiles; chart printed on the paper under a 3px rule.             |
| Detail        | 4     | Tabular figures, muted small units, real minus, chip "over" + hatch, hover/disabled/focus states shown.     |
| Side by side  | 5     | Next to `reference-facts-light.png` the Today panel reads as the same label at the same weight.             |
