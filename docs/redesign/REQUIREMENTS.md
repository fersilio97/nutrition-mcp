# Dashboard redesign, round 3: requirements (visual re-skin)

Status: **draft for the user's review** (written 2026-11-10). Stage 2
(`frontend-implementer`) builds exactly this once the user approves it. The brief is
`docs/redesign/BRIEF.md`.

## 0. Scope and what carries over

This round changes **how the dashboard looks**. It does not change what it does.

- **Binding and unchanged:** everything in `docs/redesign/archive/round-2/REQUIREMENTS.md`
  §0, §0b and §0c, plus that file's behaviour sections:
    - §1.1 inventory and the "behaviour that must survive" paragraph;
    - §1.3 API contract;
    - §4.1 information architecture and data flow (4 tabs, `#hash` routing, one fetch
      per range, range persistence; ranges are **7 days · 30 days · 1 year** per §0c);
    - §4.7 behaviour (pre-paint theme, real-pixel charts, pointer/keyboard inspect,
      skeletons, empty states, error banner, timezone rules);
    - §4.9 accessibility;
    - §4.11 Estimate vs reality.
- **Superseded by this file:** archive §3's "use system fonts", §4.2 colour tokens,
  §4.3 typography, §4.4 spacing/radius/elevation, §4.5 wireframes, §4.6 _visual_
  anatomy (the fields and copy it lists still stand), and §4.8 motion. Where a visual
  rule here conflicts with the archive, this file wins. Where this file is silent, the
  archive's behaviour wins.
- **Archive wireframes are stale.** Archive §4.5 predates §0b/§0c: it shows a 90-day
  range and lacks the 7-day pair, Log weight, meal Edit, the burn split, kcal balance
  and Treat. Build from the **running page** (`public/dashboard.html` as of commit
  `9c3e59f`) and the §1.2 placement table below, not from those wireframes.
- **Files the implementer may change:** `public/dashboard.html`; new
  `public/dashboard-fonts/` (3 woff2 + 3 OFL texts); `src/dashboard.ts` (font route
  plus the CSP constant only); `src/index.ts` (inside the `dashboardEnabled()` block
  only); `scripts/dashboard-preview.ts`; `src/dashboard-fixture.test.ts` (CSP test);
  a new `src/dashboard-fonts.test.ts`; `scripts/dashboard-e2e.ts` (the additions and
  selector updates authorised in §6.2); `docs/redesign/`. Nothing else. The brief's
  `do_not_touch` list applies in full.

---

## 1. Current app: inventory, gaps and regression contract

### 1.1 Feature inventory = archive §1.1 + §0b + §0c

Use archive §1.1 row by row as the parity checklist, with the §0b/§0c additions in
§1.2. **Every existing string, state, field, action and payload stays.**

Copy rules for the re-skin:

- **Uppercase is CSS only.** Every uppercase rendering in this file ("7 DAYS",
  "GOAL 2,022", "TUE, NOV 10 · AMERICA/NEW_YORK", the eyebrows) is
  `text-transform: uppercase` on the existing mixed-case source string. The DOM text
  does not change. The E2E reads `#sub` and expects the literal "Asia/Tokyo", and
  reads `.range-label small`, `#live`, `.legend` and the status lines as text.
- **Authorised new strings** (display-only, additive, no existing string removed):
    - Facts panel scaffolding: "Today", "Weight", "Sign in", "Serving size", "your
      own logs", "you, in kg" / "you, in lb", "{n} meals", "so far", "logged {date}".
    - Row labels that restate existing figures: "Goal", "Left", "Over", "Current",
      "Nutrients", "% of goal" and the "{n} %" figures.
    - Section eyebrows: "This week", "Today", "Energy", "Balance", "Calibration",
      "Macros", "Trend".
    - The panel footnotes in §4.4.1, §4.4.2 and §4.4.4.
    - The x-label formats in §4.4.6.
- **Glyph substitutions** in §4.2.4 (three strings).
- Anything else that reads differently is a parity bug.

### 1.2 Round-2 additions and where each one renders after the re-skin

| Feature (source)                                                                                    | Tab / location after re-skin                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Burn = resting + active, with "Resting burn (changes with weight)" and "Workout / active" (§0b 1–2) | Today label: "Est. burn" row plus a `.sub` row "1,755 resting + 104 active · est.". Trends Calories chart: dashed resting line, active segment and total ring, with legend and tooltip unchanged. |
| Today's 7-day trio: Scale, Net est. change, Net kcal balance (§0b 3, §0c B)                         | Today, the "Last 7 days" section: a ruled 3-cell strip above the mini bars. Each cell keeps its empty state and the "Log weight" link.                                                            |
| Log weight form (§0b 4)                                                                             | Body label panel: a "+ Log weight" secondary pill in the title row. The form opens inline, directly under the panel's 10px bar.                                                                   |
| Meal editor (§0b 5) + Treat (§0c D)                                                                 | Meals: an "Edit" pill per row. The editor opens inline as now. The Treat option stays in `#me-type`.                                                                                              |
| Goal vs Est. burn (break-even) wording (§0c A)                                                      | Trends Calories note (first sentence bold, as now) and the tooltip, unchanged.                                                                                                                    |
| kcal balance beside grams (§0c B)                                                                   | Body change chart direct labels, tooltip and note; Today's 7-day cell; strip tooltip.                                                                                                             |
| Weekly / monthly buckets, "n of m days logged", partial bucket marked (§0c C)                       | Trends charts. X labels follow §4.4.6.                                                                                                                                                            |
| Dimmed in-progress day / bucket                                                                     | Bars at opacity 0.55, with "so far" in the tooltip.                                                                                                                                               |
| Estimate vs reality (§4.11)                                                                         | Trends, directly under Estimated body change, as a ruled sub-panel (§4.4.3).                                                                                                                      |
| Over-goal striping with the word "over"                                                             | Brick hatch on the above-goal segment, plus the word "over" in the label row, chip, tooltip and strip.                                                                                            |
| Amber gain / blue loss with sign                                                                    | Unchanged meaning; the new tokens are in §4.1.                                                                                                                                                    |
| `#hash` routing, `localStorage` try/catch, 401 → sign out, `parseDay`, `esc()`, real minus `−`      | Untouched JS.                                                                                                                                                                                     |

### 1.3 What looks generic today (from 2026-11-10 screenshots of the `full` scenario)

1. **Card soup.** Every block is an identical white rounded card with a soft shadow on
   mint-grey paper. That gives equal weight everywhere, with nothing like the
   reference's ruled ledger.
2. **System font only.** SF/Segoe at 15px, a handful of 600–680 weights, and no display
   voice. Figures look like UI text, not like a label.
3. **Stock palette.** The series colours are Tailwind-ish (`#7c3aed`, `#4ade80`,
   `#fb923c`, `#bef264`). In dark mode they read as neon on forest. The focus ring is a
   generic blue.
4. **No motif.** Nothing on any tab recalls the Nutrition Facts label the public site
   is built on. Section heads are plain 16px bold.
5. **Body stats are six floating tiles**, and the Trends summary is four more. Both are
   textbook "dashboard grid".
6. **390px Trends x-labels collide** at 30 days ("Oct 21–27Oct 28–Nov 3"). Fix it
   during the re-skin (§4.4.6).

### 1.4 Regression contract (`scripts/dashboard-e2e.ts`)

The E2E is the parity net. **Before editing anything**, run it once against an
unmodified preview on port 8793 and record the baseline pass/fail in the log. Then
keep these selectors and behaviours, or update the E2E only where §6.2 allows:

- ids: `#email #password #login-btn #login-err #theme-btn` (with child `.i-sun` /
  `.i-moon`), `#signout`, `#tab-today #tab-trends #tab-body #tab-meals`,
  `#panel-*` and `#today-body`, `#meals-body`, `#cal-plot` (with `svg`, `.m-rest`,
  `.m-active`), `#live`, `#b-height #b-birth #b-sex #b-save #b-status`,
  `#lw-open #lw-weight #lw-note #lw-save #lw-status`,
  `#me-form #me-calories #me-type #me-save #me-cancel #me-status`.
- classes: `.banner [data-retry]`, `.range-label small`, `.seg button[data-days]`,
  `.legend`, `.notice`, `.input`, `.skel`, `.refreshing`, `.meal-list li`,
  `.btn-edit`, `.meals-table tr.meal` (**must compute `display: flex` at 390px**),
  `td.k`, `.w-now b`, `.lw-flash`, `.meal-flash`, `svg.chart text` (≥ 12px rendered).
- **Known red check:** the E2E reads the 7-day figures through
  `#today-body .trio.two`, but the current page renders that trio as
  `<div class="trio">` (three cells since §0c; the old `two` modifier is gone). That
  check is therefore expected to be **red at baseline**. The round-2 log also says
  the browser E2E was not re-run after §0c. Fix: render the 7-day strip as
  `<div class="trio strip" data-last7>` and change that one E2E selector to
  `#today-body [data-last7]`, keeping its assertion.
- **Baseline handling:** any other check that is red on the unmodified page goes in
  the log with its cause. It must be green at the end, unless the check tests
  something §0c deliberately removed. In that case, fix the check (as above) and say
  so in the log.
- `#live` is the visually hidden `aria-live` announcer for chart inspection (the E2E
  reads "Eaten", "Resting", "Active" and "Est. burn total" from it). Keep it exactly
  as it is.

---

## 1b. Taste profile of the reference (https://nutrition.labucu.com/)

Sources:

- The live HTML and `/styles.css`, fetched 2026-11-10. The live CSS is byte-identical
  to the repo's `public/styles.css` (`diff` exit 0).
- Playwright screenshots at 1440 (light and dark) and 390 of the hero, the Facts
  panel, the "How it works" ruled grid and the features grid.
- The `document.fonts` list on the live page: Bricolage Grotesque 400–800, Instrument
  Sans 400–700, Geist Mono 400/500, all `loaded`.

Re-capture those crops into `docs/redesign/screenshots/reference-*.png` (§6).

| Technique              | What the reference does (exact)                                                                                                                                                                                                                                                                                                                                                                 | How it carries over to the dashboard                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three voices           | **Bricolage Grotesque** for display and every big figure (700–800, `font-variation-settings:"opsz" 96` on display, −0.02 to −0.045em). **Instrument Sans** for body, 1rem/1.55. **Geist Mono** for eyebrows, units in chips, URLs and the live marker (0.72–0.78rem, uppercase, +0.06–0.08em).                                                                                                  | Identical families and jobs. Mono also takes chart axes, times, dates, IDs and the range control. Big figures are Bricolage; table numbers are Instrument Sans `tabular-nums`.                                                                                      |
| Display type scale     | Hero title `clamp(2.6rem, 5.8vw, 4.5rem)`. Section title `clamp(2rem, 4.4vw, 3.25rem)`. Facts title `clamp(2rem, 5vw, 2.9rem)` at 800 / −0.035em / lh 1. Facts figure `clamp(2.2rem, 7vw, 4.6rem)` at 800 / −0.045em. `text-wrap: balance` on all of these.                                                                                                                                     | §4.2.2's scale reuses these clamps, scaled down one step because this is a tool, not a landing page.                                                                                                                                                                |
| Signature structure    | `.section-head`: `border-top: 3px solid var(--rule)` (rule = ink), a mono eyebrow in a 200px left column and the title on the right. `.facts`: title, a 1px ink rule, a "Serving size" line, a **10px ink bar**, the Calories row with a huge figure, a **5px ink rule**, rows of bold label left / Bricolage 700 figure right on 1px `--line` hairlines, then a 5px rule and a muted footnote. | Every tab's hero **is** a Facts panel (Today, Body), and every other section opens with the 3px rule head. The label's 10px / 5px / 3px / 1px rule hierarchy is the dashboard's whole visual hierarchy (§4.0).                                                      |
| Ruled grids, not cards | `.steps3` and `.features-grid`: `display:grid; gap:1px; background:var(--line); border:1px solid var(--line); border-radius:22px; overflow:hidden`, with cells on `--surface` and hover to `--surface-2`.                                                                                                                                                                                       | Trends summary strip, Today's 7-day strip and the Body form grid use exactly this. No standalone tile cards anywhere.                                                                                                                                               |
| Tinted neutrals        | Light: bg `#fbfbf9` paper, surface `#fff`, ink `#111a15` (green-black), ink-2 `#56635b`, line `#dfe5e0` (green-grey). Dark: bg `#0d1210`, surface `#141c18`, ink `#edf1ee`, line `#25312a` (forest). Accent `#3b7a4f` / `#79c28c`. Calories amber `#d98a1d` / `#f0a340`. Danger brick `#a8432a` / `#e08a74`.                                                                                    | Adopted as the base (§4.1). `--ink-3` is darkened to pass AA, and the series colours are retuned to the same earthy chroma.                                                                                                                                         |
| Numbers                | `font-variant-numeric: tabular-nums` on every figure. Units are smaller and muted beside the figure, or in mono ("**20 g** protein"). Real minus `−`.                                                                                                                                                                                                                                           | The same. Verified 2026-11-10 in Chromium that all three files carry `tnum`: digit widths were 230/230/230 (Bricolage), 240/240/240 (Instrument) and 240 (Geist) for "1111/0000/8888" at 100px with `tabular-nums`, against 118/238/243 proportional for Bricolage. |
| Buttons and pills      | `.btn` is a 999px pill, min-height 44, 600 weight, −0.01em. Primary = **ink fill, bg text**, hovering to `--accent-hover`. Secondary = transparent with a `--line` border, hovering to an ink border. `:active` translateY(1px). Segmented pill (`.facts-unit`): mono 0.72rem uppercase +0.06em, pressed = accent fill.                                                                         | The same anatomy, with segments sized to 44px for touch.                                                                                                                                                                                                            |
| Header                 | Sticky, `color-mix(bg 72%)` with `saturate(160%) blur(14px)`. It shrinks 64→56 and gains a hairline on scroll, plus a 2px accent reading-progress line. Nav is text links, and the active one gets a 2px accent underline.                                                                                                                                                                      | Desktop header copies this. Mobile keeps a 4-tab bar using the same active cue (§4.3).                                                                                                                                                                              |
| Focus                  | `outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px`.                                                                                                                                                                                                                                                                                                                    | Copied, using `--focus-ring` (= the accent-hover tone, ≥ 6.4:1).                                                                                                                                                                                                    |
| Motion                 | Hero copy `rise` 0.8s ease-out with 0.05/0.15/0.28/0.4s stagger. `[data-reveal]` 18px→0, 0.7–0.8s, `cubic-bezier(.22,1,.36,1)`, children staggered 80ms. Odometer digits 1.2s. FAQ "+" rotates 45° in 0.25s. Everything off under reduced motion.                                                                                                                                               | Shorter durations, because this is a tool used several times a day (§4.6).                                                                                                                                                                                          |
| Details                | `text-wrap: balance` on titles and `pretty` on prose; `::selection` = accent 28%; a 7px "live" dot that pulses; the FAQ `<details>` uses a mono "+" marker; footnote in ink-3 0.8rem.                                                                                                                                                                                                           | Body details and the meal editor use the FAQ disclosure grammar. Footnotes copy `.facts-foot`.                                                                                                                                                                      |

---

## 2. Research (stack locked)

`stack_status: locked`. The page stays **one hand-written `public/dashboard.html`**:
inline CSS, one `"use strict"` IIFE, hand-built SVG, no build step and no framework.
The comparison and reasoning are in archive §3. Do not introduce a framework, Tailwind,
a bundler, a chart library or an icon font.

This round's only new technology is self-hosted web fonts. Findings:

| Finding                                                                                                                                                                                                                                                                                   | Source                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The reference loads `css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Geist+Mono:wght@400;500`. Google's `latin` subset for it is one variable file per family; Geist Mono 400 and 500 point at the **same** file. | Fetched from fonts.googleapis.com with a desktop Chrome UA, 2026-11-10                                                                                                                                                 |
| All three families are SIL OFL 1.1. None of the three `OFL.txt` files declares a Reserved Font Name (checked by grep), so the families can be redistributed and served as-is.                                                                                                             | `raw.githubusercontent.com/google/fonts/main/ofl/{bricolagegrotesque,instrumentsans,geistmono}/OFL.txt`, fetched 2026-11-10                                                                                            |
| Google Fonts licenses only under OFL/Apache/UFL and points self-hosters to github.com/google/fonts. Distributing a font must ship its copyright notice and licence (OFL.txt).                                                                                                             | [Google Fonts FAQ](https://developers.google.com/fonts/faq); [OFL-FAQ 1.1-update7 (2023-11)](https://openfontlicense.org/ofl-faq/); [GF guide: license file](https://googlefonts.github.io/gf-guide/license-file.html) |
| A font `preload` needs `crossorigin` even same-origin, or the font downloads twice. `type="font/woff2"`.                                                                                                                                                                                  | [web.dev, Optimize web fonts](https://web.dev/learn/performance/optimize-web-fonts); [web.dev preload codelab](https://web.dev/articles/codelab-preload-web-fonts)                                                     |
| `font-synthesis: none` (shorthand) is Baseline widely available, including Safari, so no faux bold or italic appears.                                                                                                                                                                     | [MDN font-synthesis](https://developer.mozilla.org/docs/Web/CSS/font-synthesis)                                                                                                                                        |
| Axes verified in Chromium 2026-11-10 against the exact files below:<br>• Bricolage `opsz` is live: a 50px sample is 502px wide at `"opsz" 12` vs 445px at `"opsz" 96`.<br>• Bricolage `wght` tops out at 800 (800 and 900 measure the same).<br>• Instrument Sans tops out at 700.        | Playwright measurement, `/tmp/r3shots/more.mjs`                                                                                                                                                                        |

---

## 3. Decision

Keep the locked stack (archive §3). It meets each runtime constraint as follows:

- **Zero third-party requests:** the fonts come from the app's own origin
  (`/dashboard-fonts/*`). The E2E already flags any foreign request.
- **CSP:** `/dashboard` gets its own CSP with `font-src 'self'` (§5.2). There are no
  `data:` URIs: patterns and icons are inline `<svg>`, and fonts are files.
- **iPhone Safari at 390px:** there is no horizontal scroll, inputs are 16px and tabs
  are ≥ 44px. Variable woff2 fonts with `font-display: swap` are supported.
- **Docker:** `COPY . .` already carries `public/dashboard-fonts/`. `.dockerignore`
  excludes `*.md` only, and nothing generates or depersonalises the folder. No
  Dockerfile change.

---

## 4. Design requirements

### 4.0 Design direction

**Concept.** _Your day, printed as a Nutrition Facts label._ The dashboard is a set of
labels and ledgers for one person: each tab's headline is a Facts panel, and
everything below it is a section of the same printed sheet.

**Signature motif: the FDA Nutrition Facts label,** as structure, never decoration.
It is the same grammar as the public site, adapted to dense data. Rule hierarchy (the
only way hierarchy is expressed, together with type size):

| Rule                        | Where                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| **10px ink bar**            | Directly under a Facts panel's serving line (Today, Body, Login). One per panel.               |
| **5px ink rule**            | Under the headline Calories / Weight row, and above each panel footnote.                       |
| **3px ink rule** (`--rule`) | Above every section head (Trends sections, Last 7 days, Today's meals, each Meals day header). |
| **1px ink rule**            | Under a Facts panel title; chart baselines and the zero line; the tooltip's total row.         |
| **1px `--line` hairline**   | Between rows, between ruled-grid cells, and the table rows.                                    |

Rules that follow from the motif:

- **Bold label left, figure right** for every label/value pair: Facts rows, tooltip
  rows, Estimate vs reality rows, strip cells on wide screens.
- **Ruled 1px-gap grids** (the `.features-grid` technique) for every multi-cell group.
  **No free-floating tile cards.** The only boxed objects are Facts panels (radius 22,
  1px line, `--shadow-card`, exactly `.facts`), ruled grids, the tooltip, the login
  panel and form inputs.
- Chart sections sit **unboxed on the page background**, opened by a 3px rule head,
  like the reference's sections. Charts are printed on the paper, not in widgets.
- **Distinctiveness test:** "A paper-white page; the day's calories set as a 4rem
  black figure inside a printed food label with a 10px bar; charts hung under heavy
  black rules with monospaced axes; macros as % Daily-Value rows." That is not a
  generic SaaS dashboard.

**House style applied:** three faces, three jobs (§4.2). Neutrals tinted green. Dark
is forest, not grey. One brand accent (green). Calories amber is the domain colour,
and the macro series are retuned to the same earthy chroma. Big figures, units muted.
Fluid spacing, strong left alignment, max width 1120px.

**Banned here** (on top of the generic list): rounded white tile grids; pill-shaped
tab backgrounds (`--accent-soft` fills on tabs or segments); blue focus rings; Tailwind
hexes (`#7c3aed #4ade80 #fb923c #bef264 #2dd4bf #38bdf8`); system fonts as the rendered
face; emoji (the reference's 🍏 brand mark is **not** copied; use the SVG mark in
§4.3); centred layouts except the login panel; shadows on anything but Facts panels,
the tooltip and the login.

**Hero moment per view:**

| View   | Hero                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login  | A small Facts panel: "Sign in" as the label title, "Serving size **your own logs**", the 10px bar, then the fields as label rows. It reads as the product's own label.                                                                                             |
| Today  | **"Today" Facts panel.** The Calories row has the eaten figure at `--fs-hero` on the right and the goal ring (with % in its centre) on the left. Below it come the Goal / Left (or Over) / Est. burn / Est. change rows, then the nutrients as % Daily-Value rows. |
| Trends | **Calories chart** under a 3px rule head: amber bars, the goal as a **2px ink step line** (the label rule, printed on the chart), the burn as slate rings and a dashed line, and mono axes.                                                                        |
| Body   | **"Weight" Facts panel.** The current weight at `--fs-hero`, then Change / To target / BMI / Healthy range / Resting burn / Est. burn today as label rows, with "+ Log weight" as a pill in the title row.                                                         |
| Meals  | **Day ledger.** Each day opens with a 3px rule, the date as a mono eyebrow and the day total right-aligned in Bricolage, then hairline meal rows with aligned tabular columns.                                                                                     |

### 4.1 Colour tokens

Declare all tokens in the same three blocks as today:

1. `:root, :root[data-theme="light"]`
2. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`
3. `:root[data-theme="dark"]`

The light values double as `:root[data-theme="light"]` (item 1). Every dark value
appears once in the media block and once in the attribute block. Keep the
pre-paint script.

SVG marks take colour through CSS classes (`.m-kcal{fill:var(--kcal)}`), never
`fill="var(--x)"`.

| Token            | Light                                                                | Dark                                                         | Role                                                                                                 |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `--bg`           | `#fbfbf9`                                                            | `#0d1210`                                                    | page paper (reference)                                                                               |
| `--bg-alt`       | `#f2f4f0`                                                            | `#111916`                                                    | skeleton base, the sticky header's underlay when not blurred                                         |
| `--surface`      | `#ffffff`                                                            | `#141c18`                                                    | Facts panels, ruled-grid cells, tooltip, inputs                                                      |
| `--surface-2`    | `#f4f6f2`                                                            | `#1a2420`                                                    | tracks, hover fill, Meals day-header band, open-editor row                                           |
| `--ink`          | `#111a15`                                                            | `#edf1ee`                                                    | primary text, `--rule`, goal line, primary button fill                                               |
| `--ink-2`        | `#56635b`                                                            | `#9eaaa2`                                                    | secondary text, notes, units, unselected tabs                                                        |
| `--ink-3`        | `#68736b`                                                            | `#86918a`                                                    | footnotes, axis ticks, times. **Changed from the reference's `#8b958e` / `#6c776f` to pass AA.**     |
| `--line`         | `#dfe5e0`                                                            | `#25312a`                                                    | hairlines and ruled-grid gaps (decorative)                                                           |
| `--line-2`       | `#eceeea`                                                            | `#1d2722`                                                    | chart gridlines                                                                                      |
| `--rule`         | `var(--ink)`                                                         | `var(--ink)`                                                 | the label's heavy rules                                                                              |
| `--control`      | `#7c8a81`                                                            | `#66736b`                                                    | input / select / secondary-pill borders (≥ 3:1)                                                      |
| `--accent`       | `#3b7a4f`                                                            | `#79c28c`                                                    | brand green: weight line, ring arc when under goal, pressed segment fill, progress hairline          |
| `--accent-text`  | `#2f6440`                                                            | `#9ad6a8`                                                    | eyebrows, link-buttons, active tab underline (= the reference's `--accent-hover`)                    |
| `--accent-ink`   | `#ffffff`                                                            | `#0d1210`                                                    | text on `--accent`                                                                                   |
| `--accent-soft`  | `#e4efe6`                                                            | `#18291f`                                                    | healthy-BMI band, `::selection` base. **Never behind small text except `--ink` / `--ink-2`.**        |
| `--focus-ring`   | `#2f6440`                                                            | `#9ad6a8`                                                    | 2px outline, 3px offset                                                                              |
| `--kcal`         | `#b8710f`                                                            | `#f0a340`                                                    | calories eaten: chart bars, the Today ring arc up to goal, the 7-day strip bars                      |
| `--protein`      | `#6d4fc2`                                                            | `#b6a1f2`                                                    | protein                                                                                              |
| `--carbs`        | `#2f7d3a`                                                            | `#8acb7f`                                                    | carbs                                                                                                |
| `--fat`          | `#c2405e`                                                            | `#f08aa0`                                                    | fat                                                                                                  |
| `--fiber`        | `#1a7a72`                                                            | `#5cc8bc`                                                    | fiber                                                                                                |
| `--sugar`        | `#6b7a12`                                                            | `#c4d46a`                                                    | sugar (meal rows only today)                                                                         |
| `--water`        | `#1f6fa8`                                                            | `#6fb6e8`                                                    | water (reserved, N1)                                                                                 |
| `--burn`         | `#4d5d7a`                                                            | `#a3b1cc`                                                    | est. burn: slate, deliberately desaturated so it reads as a reference, not a series                  |
| `--over`         | `#a8432a`                                                            | `#e08a74`                                                    | over goal: brick (the reference's `--danger`), always with hatch + the word "over"                   |
| `--over-tint`    | `#f2dcd5`                                                            | `#3a221c`                                                    | pale ground under the over hatch, and the `.chip.over` background (`--over` text on it: 4.56 / 5.65) |
| `--gain`         | `#a35a0b`                                                            | `#f2b25c`                                                    | estimated gain: bars up, "+N"                                                                        |
| `--loss`         | `#2563a6`                                                            | `#7fb0f0`                                                    | estimated loss: bars down, "−N"                                                                      |
| `--warn`         | `#8a5a00`                                                            | `#e8b45a`                                                    | "needs details" notices, the "partial" hint                                                          |
| `--shadow-card`  | `0 1px 2px rgba(17,26,21,.04), 0 12px 32px -12px rgba(17,26,21,.12)` | `0 1px 2px rgba(0,0,0,.3), 0 12px 32px -12px rgba(0,0,0,.6)` | Facts panels, login (reference values)                                                               |
| `--shadow-float` | `0 2px 4px rgba(17,26,21,.06), 0 30px 60px -20px rgba(17,26,21,.25)` | `0 2px 4px rgba(0,0,0,.4), 0 30px 60px -20px rgba(0,0,0,.7)` | tooltip only                                                                                         |

The calorie **ring arc** is `--kcal` up to the goal and hatched `--over` beyond it, as
in round 2. `--accent` is not used on the ring.

**Contrast, computed 2026-11-10 with the WCAG 2.x relative-luminance formula**
(`/tmp/r3shots/contrast.py`).

Text pairs (4.5:1 body, 3:1 large):

| Pair                             | Light: bg / surface / surface-2 / accent-soft | Dark: bg / surface / surface-2 / accent-soft |
| -------------------------------- | --------------------------------------------- | -------------------------------------------- |
| ink                              | 17.14 / 17.76 / 16.33 / 15.04                 | 16.58 / 15.23 / 13.98 / 13.39                |
| ink-2                            | 6.08 / 6.30 / 5.80 / 5.34                     | 7.85 / 7.22 / 6.62 / 6.34                    |
| ink-3                            | 4.77 / 4.94 / 4.54 / **4.18 ✗**               | 5.79 / 5.32 / 4.88 / 4.67                    |
| accent-text                      | 6.72 / 6.96 / 6.40 / 5.89                     | 11.30 / 10.39 / 9.53 / 9.13                  |
| accent (as text)                 | 4.96 / 5.14 / 4.73 / **4.36 ✗**               | 8.92 / 8.20 / 7.52 / 7.20                    |
| over                             | 5.79 / 6.00 / 5.52 / 5.08                     | 7.25 / 6.66 / 6.12 / 5.86                    |
| warn                             | 5.72 / 5.93 / 5.45 / 5.02                     | 10.00 / 9.19 / 8.43 / 8.07                   |
| gain                             | 5.04 / 5.22 / 4.80 / **4.42 ✗**               | 10.17 / 9.34 / 8.58 / 8.21                   |
| loss                             | 5.94 / 6.15 / 5.66 / 5.21                     | 8.43 / 7.75 / 7.11 / 6.81                    |
| accent-ink on accent             | 5.14                                          | 8.92                                         |
| bg on ink (primary button)       | 17.14                                         | 16.58                                        |
| bg on accent-text (btn hover)    | 6.72                                          | 11.30                                        |
| over on over-tint (`.chip.over`) | 4.56                                          | 5.65                                         |

Graphics and UI pairs (3:1):

| Token   | Light: surface / surface-2 / bg | Dark: surface / surface-2 / bg |
| ------- | ------------------------------- | ------------------------------ |
| kcal    | 3.88 / 3.57 / 3.75              | 8.29 / 7.61 / 9.02             |
| protein | 5.92 / 5.44 / 5.71              | 7.75 / 7.11 / 8.43             |
| carbs   | 5.10 / 4.69 / 4.93              | 9.04 / 8.30 / 9.84             |
| fat     | 5.01 / 4.61 / 4.84              | 7.32 / 6.72 / 7.96             |
| fiber   | 5.16 / 4.74 / 4.98              | 8.64 / 7.93 / 9.40             |
| sugar   | 4.75 / 4.37 / 4.59              | 10.73 / 9.85 / 11.68           |
| water   | 5.39 / 4.95 / 5.20              | 7.88 / 7.24 / 8.58             |
| burn    | 6.64 / 6.11 / —                 | 8.04 / 7.38 / —                |
| over    | 6.00 / 5.52 / 5.79              | 6.66 / 6.12 / 7.25             |
| gain    | 5.22 / 4.80 / 5.04              | 9.34 / 8.58 / 10.17            |
| loss    | 6.15 / 5.66 / 5.94              | 7.75 / 7.11 / 8.43             |
| accent  | 5.14 / 4.73 / 4.96              | 8.20 / 7.52 / 8.92             |
| control | 3.61 / 3.32 / 3.49              | 3.50 / 3.21 / 3.81             |
| focus   | 6.96 / 6.40 / 6.72              | 10.39 / 9.53 / 11.30           |

Usage rules (they follow from the ✗ cells and the near-equal pairs):

1. **Never put `--ink-3`, `--accent` or `--gain` text on `--accent-soft`.** Text on
   `--accent-soft` is `--ink` or `--ink-2` only.
2. **`--kcal` is graphics-only in light mode** (3.57–3.88). Calorie figures are set in
   `--ink`, with a kcal swatch beside them where a cue is needed.
3. **Series colours are never body text in light mode.** Legends and labels are
   `--ink` / `--ink-2` text next to a swatch.
4. **Pairs that need shape, not hue:**
    - `--burn` vs `--loss` is 1.08 (light) and 1.04 (dark). They live on different
      charts; burn is always a hollow ring or a dashed line, never a filled bar.
    - `--gain` vs `--loss` is 1.18 / 1.21: direction plus sign.
    - `--kcal` vs `--over` is 1.54 / 1.24: hatch plus "over".
    - `--kcal` vs `--gain` are both amber: separate charts, and gain carries a "+" sign.
5. **`--line` hairlines are decorative** (1.2–1.4:1). Any boundary that carries
   meaning (an input edge, a pressed segment, a chart baseline) uses `--control` or
   `--rule`.
6. If the implementer changes any token, they recompute its rows and update this table
   in the implementation log.

### 4.2 Typography

#### 4.2.1 Families, files and licences (self-hosted, zero third-party requests)

Download **once at implementation time** with `curl` from the exact URLs below. These
are Google's own `latin` subsets, as served to desktop Chrome for the reference's CSS
URL on 2026-11-10. Check byte size and sha256, then commit them. At runtime nothing is
fetched from Google.

| File in `public/dashboard-fonts/`    | Source URL                                                                                                             | Bytes  | sha256                                                             | Axes / weights used                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `bricolage-grotesque-latin-v9.woff2` | `https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInHWVyNJ.woff2` | 76,868 | `85f55a58a31e61a2e19e8bb25fed503181bf2a6b4cab76c589992cfaac377447` | `opsz` 12–96, `wght` 400–800 (wdth pinned 100)         |
| `instrument-sans-latin-v4.woff2`     | `https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1ZuWi3g.woff2`          | 29,904 | `6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311` | `wght` 400–700, upright only                           |
| `geist-mono-latin-v6.woff2`          | `https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2`                                       | 23,108 | `5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b` | `wght` 400–500 only                                    |
| `OFL-BricolageGrotesque.txt`         | `https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/OFL.txt`                                   | 4,403  | —                                                                  | Copyright 2022 The Bricolage Grotesque Project Authors |
| `OFL-InstrumentSans.txt`             | `https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt`                                       | 4,403  | —                                                                  | Copyright 2022 The Instrument Sans Project Authors     |
| `OFL-GeistMono.txt`                  | `https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/OFL.txt`                                            | 4,387  | —                                                                  | Copyright 2024 The Geist Project Authors               |

- The total is 129,880 bytes of font. **The Instrument Sans italic is not shipped**:
  the page uses no italics (no `<em>`, `<i>` or `font-style`). Do **not** re-subset or
  modify the files. They are used exactly as Google distributes them, under OFL 1.1,
  and no Reserved Font Name applies.
- If a sha256 differs on download, Google has updated the file. Use the new file,
  record its size and hash in the log, and rename `v9`/`v4`/`v6` to the version in
  the new URL. The filename **must** change whenever the bytes change, because the
  route caches them `immutable`.

`@font-face` declarations, inline at the top of the `<style>` (no `unicode-range`, so
the browser falls back per glyph only for characters the files lack):

```css
@font-face {
    font-family: "Bricolage Grotesque";
    src: url("/dashboard-fonts/bricolage-grotesque-latin-v9.woff2")
        format("woff2");
    font-weight: 400 800;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: "Instrument Sans";
    src: url("/dashboard-fonts/instrument-sans-latin-v4.woff2") format("woff2");
    font-weight: 400 700;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: "Geist Mono";
    src: url("/dashboard-fonts/geist-mono-latin-v6.woff2") format("woff2");
    font-weight: 400 500;
    font-style: normal;
    font-display: swap;
}
```

Put two preloads in `<head>`, right after the pre-paint script:

```html
<link
    rel="preload"
    href="/dashboard-fonts/instrument-sans-latin-v4.woff2"
    as="font"
    type="font/woff2"
    crossorigin
/>
<link
    rel="preload"
    href="/dashboard-fonts/bricolage-grotesque-latin-v9.woff2"
    as="font"
    type="font/woff2"
    crossorigin
/>
```

Stacks (the fallbacks render only for missing glyphs, e.g. a non-Latin meal
description):

```css
--font-display:
    "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
--font-body:
    "Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

Set `body { font-synthesis: none; }`. **Weight caps:** Bricolage 400–800, Instrument
400–700, Geist Mono 400 or 500 only. Replace every 550/650/680 weight in the current
CSS with an in-range value from §4.2.2. Use no mono weight above 500.

#### 4.2.2 Scale

Type sizes use `rem`; 16px is the base.

| Token          | Value                                   | Face / weight                                                                                       | Tracking / lh  | Used for                                                                                    |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `--fs-hero`    | `clamp(3rem, 2rem + 4.5vw, 4.6rem)`     | Bricolage 800, opsz auto                                                                            | −0.045em / 1   | Today eaten kcal, Body current weight (`.w-now b`)                                          |
| `--fs-display` | `clamp(2rem, 1.5rem + 2.4vw, 2.9rem)`   | Bricolage 800, `"opsz" 96`                                                                          | −0.035em / 1   | Facts panel titles ("Today", "Weight", "Sign in")                                           |
| `--fs-h2`      | `clamp(1.35rem, 1.1rem + 1vw, 1.75rem)` | Bricolage 700, `"opsz" 96`                                                                          | −0.025em / 1.1 | Section titles (Calories, Estimated body change, Last 7 days…), `.range-label`              |
| `--fs-figure`  | `clamp(1.5rem, 1.25rem + 1vw, 2rem)`    | Bricolage 700                                                                                       | −0.03em / 1.05 | Ruled-strip cells (Trends summary, Today 7-day)                                             |
| `--fs-row`     | `1.15rem`                               | Bricolage 700                                                                                       | −0.02em / 1.2  | Facts row figures, Meals day total, Today's meal kcal                                       |
| `--fs-label`   | `1.05rem`                               | Bricolage 700                                                                                       | −0.01em / 1.2  | Facts row labels ("Calories", "Protein"), meal type in Today                                |
| `--fs-body`    | `1rem`                                  | Instrument 400                                                                                      | 0 / 1.55       | Body text, meal descriptions, inputs (16px, no iOS zoom)                                    |
| `--fs-small`   | `0.875rem`                              | Instrument 400                                                                                      | 0 / 1.5        | Chart notes, row subs, form hints; `max-width: 68ch; text-wrap: pretty`                     |
| `--fs-foot`    | `0.8125rem`                             | Instrument 400, `--ink-3`                                                                           | 0 / 1.45       | Panel footnotes, meals footer                                                               |
| `--fs-eyebrow` | `0.75rem`                               | Geist Mono 500, uppercase                                                                           | +0.08em / 1.3  | Eyebrows, strip cell labels, table heads, Meals day dates (tab labels are Instrument, §4.3) |
| `--fs-mono`    | `0.8125rem`                             | Geist Mono 400                                                                                      | 0 / 1.4        | Times (`08:10`), dates in sub lines, units in chips, timezone                               |
| chart text     | `12px` rendered                         | Geist Mono 400 (ticks, x labels, "GOAL 2,022"); Instrument 600 `tabular-nums` (direct value labels) | 0              | inside `svg.chart`                                                                          |

Numbers:

- Every figure gets `font-variant-numeric: tabular-nums` (set on `body`).
- A unit next to a big figure is `0.42em` Instrument 500 `--ink-2` with a `0.15em`
  left margin: "1,240<small>kcal</small>". Inside rows the unit is `--fs-small`
  `--ink-2`.
- Signs use the real minus `−`.
- Headings get `text-wrap: balance`; notes and descriptions get `text-wrap: pretty`.

#### 4.2.3 Where each voice goes (unambiguous)

- **Bricolage:** panel titles, section titles, every headline/row/strip figure, Facts
  row labels, the brand word "Nutrition", login title.
- **Instrument Sans:** prose, notes, descriptions, form labels, buttons, tab labels,
  table body cells including numbers, tooltip rows, chart direct labels.
- **Geist Mono:** eyebrows, strip cell labels, table header cells, the header date/tz
  sub line, times, Meals day dates, segmented range buttons, axis ticks and x labels,
  the goal end label, the "partial" and "so far" tags, the details "+" marker.

#### 4.2.4 Glyph coverage (UI strings must never fall back)

The three files' `cmap` tables were read directly on 2026-11-10 (woff2 decoded with
Brotli, `/tmp/r3tools/cmap.mjs`).

- **Present in all three:** `− – — · › … × ÷ ’ “ ”`.
- **Missing from all three:** `→` U+2192, `▲` U+25B2, `≥` U+2265, `●` U+25CF, and
  the narrow no-break space U+202F.
- **U+2009 thin space** is in Bricolage only, so do not use it; use a normal space.

An audit of `public/dashboard.html` found these misses in UI strings:

| Glyph      | Where                                                                                        | Replace with                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `→` U+2192 | 7-day Scale cell date span ("Nov 5 → Nov 10"); Estimate vs reality "Period: Oct 12 → Nov 10" | `–` (U+2013) with normal spaces: "Nov 5 – Nov 10", "Period: Oct 12 – Nov 10"                                                                        |
| `→` U+2192 | Empty note "under Body → Body details"                                                       | `›` (U+203A): "under Body › Body details"                                                                                                           |
| `▲` U+25B2 | Over-goal foot `.over-text`                                                                  | an inline SVG triangle (`<svg class="ico-up" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9.5 9h-9z"/></svg>`, 0.7em, `fill: currentColor`) |

Comment-only uses (`≥`, `ⁿ`) need nothing. Any **new** non-ASCII character the
implementer adds must be in the "present" list above. Dots and swatches are CSS
shapes, never `●`/`■` glyphs. The ASCII-art wireframes below use such glyphs only as
drawing notation. Meal descriptions are user text and
may legitimately fall back to the system face. "No fallback" in §6 applies to UI
strings only.

### 4.3 Chrome: header, tabs, range control, buttons

**Header** (`<header class="top">`):

- **≤ 1023px:** the header scrolls away; only the tab bar sticks.
    - Left: a 22px inline-SVG brand mark, a miniature label (rounded 3px square, 2px
      ink stroke, with a 3px ink bar and two 1px hairlines inside, `aria-hidden`).
      Then "Nutrition" in Bricolage 800 1.25rem −0.03em.
    - Below that, the sub line in `--fs-mono` `--ink-2`: "TUE, NOV 10 ·
      AMERICA/NEW_YORK" (uppercase, +0.04em, ellipsis). On a fetch error the existing
      error copy plus Retry, in `--over`.
    - Right: `#theme-btn` (44×44 icon, sun/moon SVG 20px stroke 1.75, keep `.i-sun` /
      `.i-moon`) and `#signout`: a 44×44 icon at ≤ 480, a secondary pill "Sign out"
      (`.btn-sm` 36px visual inside a 44px hit area) at ≥ 481.
- **≥ 1024px:** a single sticky row, reference `.site-head` style.
    - Height 64px, shrinking to 56px with a 1px `--line` bottom hairline once
      `body.scrolled`.
    - Background `color-mix(in srgb, var(--bg) 72%, transparent)` with
      `saturate(160%) blur(14px)`, or solid `--bg` without support.
    - Grid `auto 1fr auto`: brand block left, tabs centred as text nav, actions right.
    - The sub line moves under "Nutrition".

**Tabs** (APG markup unchanged):

- **≥ 481px:** text nav like the reference: Instrument 500 0.95rem, `--ink-2`, hover
  `--ink`. Selected: `--ink`, weight 600, and a **2px `--accent-text` underline** 6px
  below the baseline (`::after`, width = label width). Icons are shown at 481–1023
  (18px, left of the label) and hidden at ≥ 1024. Targets are ≥ 44px tall.
- **≤ 480px:** a full-width sticky bar, `--bg` at 84% with blur and a `--line` bottom
  hairline.
    - Four equal cells, 56px tall, with a 22px icon above an Instrument 500 12px label.
    - Unselected: `--ink-2`. Selected: `--ink`, label weight 600, icon stroke `--ink`,
      and a 2px × 24px `--accent-text` bar 4px under the label.
    - **No pill fill.** Weight plus bar are the non-colour cues.
- Nice-to-have: the reference's 2px `--accent` reading-progress hairline on the sticky
  row's bottom edge, off under reduced motion.

**Range control** `.seg` (Trends and Meals):

- Built as the reference's `.facts-unit` at touch size: an inline-flex pill with 2px
  padding, `--surface-2` fill and a 1px `--line` border.
- Buttons are Geist Mono 500 0.75rem uppercase +0.06em ("7 DAYS", "30 DAYS",
  "1 YEAR"). Min height 40px inside a 44px hit area (the group's padding counts),
  min-width 76px, radius 999, `--ink-2`.
- Pressed: `--accent` fill, `--accent-ink` text (5.14 / 8.92), `aria-pressed`
  unchanged. Hover on unpressed: `--ink`. Keep `data-days`.
- In flight: `aria-disabled` plus the 12px spinner in the pressed segment, as now.

**Buttons** (reference `.btn`):

- Primary (`.btn.primary`: Sign in, Save, Save changes, Log): ink fill, `--bg` text,
  999px pill, min-height 44, Instrument 600 1rem −0.01em. Hover fill
  `--accent-text`, `:active` translateY(1px), disabled opacity 0.5.
- Secondary (`.btn`: Cancel, Retry, "+ Log weight", `.btn-edit`): transparent, 1px
  `--control` border, `--ink` text. Hover border `--ink`.
- `.btn-edit` is `.btn-sm`: a 32px visual pill (0.85rem) inside a 44px hit area via
  padding/margin. On `pointer: coarse` it is ≥ 44px.
- `.link-btn` ("See trends ›", "Log weight", "Add body details"): `--accent-text`,
  Instrument 600 `--fs-small`, no underline at rest, 1px underline at 3px offset on
  hover/focus. The `›` slides 3px right on hover (reference `.btn-link::after`), off
  under reduced motion.

### 4.4 Views: anatomy and layout

**Breakpoints:** ≤ 480 (phone), 481–1023 (tablet), ≥ 1024 (desktop), with a 700px
sub-step where noted.

**Page:** max-width 1120px. Gutter `clamp(1rem, 4vw, 2.5rem)` plus safe-area insets.
Vertical rhythm `--gap-section: clamp(2.25rem, 5vw, 3.5rem)` between sections,
`--gap-block: clamp(1rem, 2.5vw, 1.5rem)` inside them.

**Spacing scale** (4px base): `--s1 4 · --s2 8 · --s3 12 · --s4 16 · --s5 20 · --s6 24 · --s8 32 · --s10 40 · --s12 48`.

**Radius:**

- `--r-panel: 22px`: Facts panels, ruled grids, login.
- `--r-input: 12px`: inputs, selects, textarea.
- `--r-pill: 999px`: buttons, segments, chips.
- `--r-tip: 12px`: tooltip.
- Bars: **square** (0 radius), as printed. The 2px surface gap between stacked
  segments stays.

**Section head** (`.sec-head`):

- `border-top: 3px solid var(--rule)`, `padding-top: var(--s4)`.
- A mono eyebrow line (`--accent-text`), then the `--fs-h2` title, then the
  `--fs-small` note.
- An optional right slot (legend, link-btn or range) wraps under the title at
  < 700px.
- At ≥ 1024 use the reference's two-column `.section-head`: the eyebrow in a 180px left
  column, title and note on the right. Charts span the **full** width below the head,
  not the right column only.

**Facts panel** (`.facts`):

- `--surface`, 1px `--line`, `--r-panel`, `--shadow-card`, padding
  `clamp(1rem, 3vw, 1.5rem) clamp(1rem, 3vw, 1.5rem) var(--s2)`.
- Title row: `--fs-display`, flex, `space-between`, with the action pill on the right.
  Then a 1px `--rule` border-bottom.
- Serving line: `--fs-small` `--ink-2` with a bold `--ink` value. The mono date
  tag sits on the right. Then a **10px `--rule`**.
- Headline row (`.facts-cal`): label left (`--fs-label`, with a `--fs-small` `--ink-2`
  sub), figure right (`--fs-hero`). Then a **5px `--rule`**.
- Rows (`.facts-row`): flex, baseline, `space-between`, padding `0.55rem 0`, 1px
  `--line` bottom. Label `--fs-label` and figure `--fs-row`. A `.sub` row is indented
  `1.25rem`, `--fs-small`, `--ink-2` label, and Instrument 600 `--ink` value.
- Footnote (`.facts-foot`): a 5px `--rule` on top, then `--fs-foot` `--ink-3`.

**Ruled strip** (`.strip`): exactly `.features-grid`.

- `display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--r-panel); overflow: hidden`.
- Cells: `--surface`, padding `var(--s4) var(--s5)`. Mono eyebrow label, then the
  `--fs-figure` figure with its unit, then the `--fs-small` foot.
- Hover `--surface-2` (only when the cell is interactive).

#### 4.4.1 Login

```
390px                                   1440px (centred, max-width 400px panel)
┌────────────────────────────────┐      ┌──────────────── page bg ──────────────────┐
│ [mark] Nutrition               │      │              [mark] Nutrition             │
│                                │      │      ┌──────────────────────────────┐     │
│ ┌────────────────────────────┐ │      │      │ Sign in                      │     │
│ │ Sign in            (title) │ │      │      │──────────────────────────────│1px  │
│ │────────────────────────────│ │      │      │ Serving size  your own logs  │     │
│ │ Serving size your own logs │ │      │      │██████████████████████████████│10px │
│ │████████████████████████████│ │      │      │ Sign in with the same email… │     │
│ │ Sign in with the same      │ │      │      │ EMAIL                        │     │
│ │ email and password you used│ │      │      │ [__________________________] │     │
│ │ to connect your MCP client.│ │      │      │ PASSWORD                     │     │
│ │ EMAIL                      │ │      │      │ [__________________________] │     │
│ │ [________________________] │ │      │      │ (  Sign in  ) ink pill, full │     │
│ │ PASSWORD                   │ │      │      │ #login-err (role=alert)      │     │
│ │ [________________________] │ │      │      │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│5px  │
│ │ (        Sign in         ) │ │      │      │ Private: only you see this.  │foot │
│ │ #login-err                 │ │      │      └──────────────────────────────┘     │
│ │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│ │      └───────────────────────────────────────────┘
│ │ foot                       │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- The existing `h1` "Your nutrition dashboard" stays, visually hidden (`.sr-only`).
  The visible panel title is `<p class="facts-title" aria-hidden="true">Sign in</p>`.
  Keep all existing help copy and errors.
- The footnote is added: "Private: only you can see these logs." It is an authorised
  new string.
- Field labels are mono eyebrows, `--ink-2`. Inputs are 48px tall, 16px, `--surface`,
  1px `--control` border and 12px radius. Focus keeps the border and adds the ring.
- `#login-err` is `--over`, Instrument 600 `--fs-small`.
- The theme toggle is not on the login (parity).

#### 4.4.2 Today

```
390px                                         1440px
┌──────────────────────────────────┐          ┌───────────────────────────────────────────────────────────────────────────┐
│[m] Nutrition              ☾  ⇥  │          │[m] Nutrition        Today  Trends  Body  Meals              ☾  (Sign out)  │ sticky 64
│TUE, NOV 10 · AMERICA/NEW_YORK    │          │    TUE, NOV 10 · AMERICA/NEW_YORK  ‾‾‾‾‾                                   │
├──────────────────────────────────┤ sticky   ├───────────────────────────────────────────────────────────────────────────┤
│ ◯Today  ılTrends  ◰Body  ≡Meals  │          │ ┌ Facts panel (5/12 cols) ─────────────┐   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  ‾‾‾                             │          │ │ Today                    2 MEALS     │   THIS WEEK                       │
├──────────────────────────────────┤          │ │──────────────────────────────────────│   Last 7 days        See trends › │
│┌────────────────────────────────┐│          │ │ Serving size Tue, Nov 10   ● SO FAR │   ┌─────────┬──────────┬────────┐ │
││ Today                 2 MEALS  ││          │ │██████████████████████████████████████│   │SCALE    │NET EST.  │NET KCAL│ │
││────────────────────────────────││          │ │ (ring 35%)  Calories        1,240   │   │+300 g   │−100 g    │−769    │ │
││ Serving size Tue, Nov 10 ●SO FAR│          │ │             eaten today   kcal       │   │Nov 5–10 │6 days·est│−128/day│ │
││████████████████████████████████││ 10px     │ │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│   └─────────┴──────────┴────────┘ │
││(ring)  Calories         1,240  ││ hero     │ │ Goal                      1,904 kcal │   ▂ ▇ _ ▅ ▇ ▆▨ ▄   bars + ink ticks │
││ 35%    eaten today       kcal  ││          │ │   1,800 base + 104 active            │   W T F S S M  T                  │
││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬││ 5px      │ │ Left                        664 kcal │                                   │
││ Goal               1,904 kcal  ││          │ │ Est. burn                 1,859 kcal │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
││   1,800 base + 104 active      ││ .sub     │ │   1,755 resting + 104 active · est.  │   TODAY                           │
││ Left                 664 kcal  ││          │ │ Est. change            ● −80 g       │   Today's meals  2 meals·1,240kcal│
││ Est. burn          1,859 kcal  ││          │ │   so far · estimate                  │   08:10 Breakfast        422 kcal │
││   1,755 resting + 104 active   ││          │ │██████████████████████████████████████│   Oats with berries and whey      │
││ Est. change         ● −80 g    ││          │ │ Nutrients                 % of goal  │   P 29 · C 45 · F 14 · Fib 11 …   │
││   so far · estimate            ││          │ │ Protein  95 / 148 g          64 %    │   ─────────────────────────────── │
││████████████████████████████████││ 10px     │ │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬──────── (4px bar)  │   12:40 Lunch            818 kcal │
││ Nutrients            % of goal ││          │ │ Carbs   113 / 190 g          59 %    │   …                               │
││ Protein 95 / 148 g      64 %   ││          │ │ Fat      46 / 64 g           72 %    │                                   │
││ ▬▬▬▬▬▬▬▬▬▬▬▬──────             ││          │ │ Fiber    20 / 30 g           67 %    │                                   │
││ Carbs  113 / 190 g      59 %   ││          │ │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│                                   │
││ Fat     46 / 64 g       72 %   ││          │ │ Goals adjust for active kcal. Est.   │                                   │
││ Fiber   20 / 30 g       67 %   ││          │ │ burn = resting + active; estimates.  │                                   │
││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬││          │ └──────────────────────────────────────┘                                   │
││ foot                           ││          └───────────────────────────────────────────────────────────────────────────┘
│└────────────────────────────────┘│
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ 3px      ≥1024: grid 5fr / 7fr, gap clamp(2rem,4vw,3.5rem); the left panel is NOT sticky (it is taller than the viewport)
│THIS WEEK                         │          481–1023: one column like 390, the panel max-width 640px; the 7-day strip is 3 cells
│Last 7 days          See trends › │
│┌──────────┬──────────┬──────────┐│ .trio.two (ruled strip, 3 cells; ≤380px stacks to 1 col with label left / figure right)
││SCALE     │NET EST.  │NET KCAL  ││
││+300 g    │−100 g    │−769 kcal ││
││Nov 5–10  │6 days ·  │−128/day ·││
││Log weight│estimate  │6 days    ││
│└──────────┴──────────┴──────────┘│
│ bars with ink goal ticks, 120px   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│TODAY                              │
│Today's meals   2 meals · 1,240 kcal│
│08:10  Breakfast          422 kcal │ .meal-list li: hairline rows, no boxes
│Oats with berries and whey         │
│P 29 · C 45 · F 14 · Fib 11 · Sug 14│
└──────────────────────────────────┘
```

Today Facts panel, exact content (all copy and states from round 2):

- **Title row:** "Today" (`--fs-display`). On the right, a mono `--ink-2` tag
  "{n} MEALS".
- **Serving line:** "Serving size **{weekday, Mon d}**". On the right the mono
  tag "so far" (uppercased by CSS), preceded by a 7px `--accent` dot drawn as a CSS
  `::before` circle. **Not a `●` glyph**: U+25CF is not in the font files. The
  reference pulses the dot (nice-to-have, 2.4s, off under reduced motion). This tag
  has nothing to do with `#live`.
- **Calories row:**
    - Left: the ring, 80px at ≤ 480 and 112px at ≥ 481, stroke 8 / 9. Track
      `--surface-2`, arc `--kcal` up to goal, `--over` hatch beyond goal, round caps.
      Its centre shows the % of goal in Geist Mono 500 0.8rem (the reference widget's
      "16%"). Then the label "Calories" with the sub "eaten today".
    - Right: the figure (`--fs-hero`), with "kcal" as the small unit.
    - **Fit at ≤ 480px** (inner width ≈ 326px): `.facts-cal` becomes
      `display:grid; grid-template-columns: 80px 1fr; column-gap: 12px`. The ring
      (80px) spans two rows. Row 1 of column 2 is the label ("Calories" plus a small
      "eaten today"), left-aligned. Row 2 is the figure, right-aligned. At ≥ 481 it is
      one flex row: ring, label (`margin-right:auto`), figure. Keep `flex-wrap: wrap`
      as a safety net so a 5-digit figure drops to its own right-aligned line rather
      than overflowing.
    - The ring keeps `role=img` and its aria-label.
    - No goal: track only, centre "—", and the foot copy "No calorie goal set — ask
      Claude to set one."
- **Rows** (each `.facts-row`; `.sub` rows indented):
    1. Goal "1,904 kcal", then `.sub` "1,800 base + 104 active".
    2. Left "664 kcal", **or** Over: the label "Over" in `--over` with the
       triangle SVG, the figure "120 kcal", a `.chip.over` "over", and an 8×8 hatch
       swatch.
    3. Est. burn "1,859 kcal", then `.sub` "1,755 resting + 104 active · est.". No
       body details: the figure "—" in `--ink-3`, with the foot link-button "Add body
       details" (switches to Body, opens and focuses the form, as now).
    4. Est. change: a `--gain`/`--loss` 8px dot, then "+/−N g", then `.sub` "so far ·
       estimate". With nothing eaten: "—" and "Nothing logged yet".
- **Another 10px bar**, then the "Nutrients" header row: label left, mono `--ink-2`
  "% OF GOAL" right (the FDA "% Daily Value" header).
- **Nutrient rows** (Protein, Carbs, Fat, Fiber):
    - Left: label (`--fs-label`) and "95 / 148 g" (Instrument 500 `--ink-2`, value
      `--ink` 600).
    - Right: "64 %" (`--fs-row`).
    - Beneath, full row width: a **4px** track (`--surface-2`) filled with the
      nutrient's token, square ends.
    - Over goal: the fill caps at 100%, the right figure reads "112 %", followed by
      `.chip.over` "over".
    - No goal: value only, no % and no track.
- **Footnote:** "Goals adjust for your watch's active calories. Est. burn = resting
  (Mifflin-St Jeor) + active — estimates, not measurements." Every estimate stays
  labelled.

"Last 7 days" section (`.sec-head`, eyebrow "THIS WEEK"):

- The 3-cell ruled strip `<div class="trio strip" data-last7>`: Scale / Net est.
  change / Net kcal balance, with every figure, swatch, sign, empty state and the
  "Log weight" link exactly as round 2.
    - 381–480px: cell padding `12px 10px`, figure `1.35rem`, unit `0.75rem`. Each cell
      is ≈ 98px of content, enough for "−769 kcal" (≈ 78px).
    - ≤ 380px: one column, label left / figure right per cell.
- **Mini bars** (120px tall at ≤ 480, 140px above):
    - Square `--kcal` bars, 2px gap.
    - The goal tick is a **2px `--rule` line** the bar width + 4px.
    - Over-goal tops are hatched. Today's bar is at 0.55 opacity.
    - Day initials in mono 12px `--ink-3`; today's initial is `--ink` 500.
- Tap-to-pin and keyboard inspection unchanged. The tooltip includes the kcal balance.

"Today's meals" section (eyebrow "TODAY"):

- Title "Today's meals", with the right slot "2 meals · 1,240 kcal" in mono.
- `.meal-list li` rows: hairline separated, padding `var(--s3) 0`, no card.
    - Line 1: time (mono `--ink-3`), meal type (Bricolage 700 `--fs-label`), and kcal
      right (`--fs-row` with a small "kcal" unit).
    - Line 2: description (Instrument, wraps, escaped).
    - Line 3: "P 29 · C 45 · F 14 · Fib 11 · Sug 14": letters `--ink-3`, values `--ink`
      500, tabular.
- Empty: "Nothing logged yet today. Tell Claude what you ate and it will show up here."
  in `--ink-2`, under the head.

#### 4.4.3 Trends

```
390px                                         1440px
│ ◯Today ılTrends ◰Body ≡Meals     │          │ OCT 12 – NOV 10 · 30 DAYS · AMERICA/NEW_YORK          ( 7 DAYS |▓30 DAYS▓| 1 YEAR ) │
│ 30 DAYS · AMERICA/NEW_YORK       │          │ Oct 12 – Nov 10                                                                      │
│ Oct 12 – Nov 10       (h2)       │          │ ┌──────────────┬──────────────┬──────────────┬──────────────────────────┐            │
│ ( 7 DAYS |▓30 DAYS▓| 1 YEAR )    │ full w   │ │DAILY AVERAGE │AVG PROTEIN   │OVER GOAL     │NET EST. CHANGE           │ ruled strip│
│┌───────────────┬───────────────┐ │          │ │1,757 kcal    │130 g         │4 of 29 days  │● −544 g                  │            │
││DAILY AVERAGE  │AVG PROTEIN    │ │          │ │26 of 30 days │goal 140 g    │complete days │25 complete days · est ·  │            │
││1,757 kcal     │130 g          │ │ 2×2      │ │logged        │              │only          │scale: −300 g             │            │
││26 of 30 logged│goal 140 g     │ │          │ └──────────────┴──────────────┴──────────────┴──────────────────────────┘            │
│├───────────────┼───────────────┤ │          │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
││OVER GOAL      │NET EST. CHANGE│ │          │ ENERGY          Calories · weekly average per logged day                              │
││4 of 29 days   │● −544 g       │ │          │                 Goal = your target; Est. burn = break-even … (note, 68ch)             │
│└───────────────┴───────────────┘ │          │                 ■ Eaten  ▨ Over goal  ━ Goal  ┄ Resting burn  ▮ Workout  ○ Est. burn │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          │  2,400 ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ GOAL 2,022     │
│ENERGY                            │          │        │      ┏━━━━━━━━━━━┓━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (2px ink step) │
│Calories · weekly average per     │          │  1,800 ┼━━━━━━┛ ○┄┄┄┄┄┄┄┄┄┄○┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄○┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄○        │
│logged day                        │          │        │   ███        ███            ███             ▒▒▒  (in progress 0.55)  │
│note…                             │          │      0 ┼━━━████━━━━━━━━████━━━━━━━━━━━━████━━━━━━━━━━━━━▒▒▒━━━ 1px rule baseline  │
│legend (wraps, 2 per line)        │          │         OCT 14–20     OCT 21–27       OCT 28–NOV 3     NOV 4–10   (mono 12px)  │
│[chart 240px]                     │          │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ x: OCT 14 · OCT 21 · OCT 28 · NOV 4│         │ BALANCE         Estimated body change (estimate)      [diverging, 180px]             │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│BALANCE                           │          │ CALIBRATION     Estimate vs reality (estimate)                                       │
│Estimated body change (estimate)  │          │ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│[diverging 160px]                 │          │ │ Estimated  logged days        ████████████│                         −544 g      │ │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          │ │ Estimated  all days…          ░░░░░░░░░░░░│                         −631 g      │ │
│CALIBRATION                       │          │ │ Scale      actual weigh-ins           █████│                         −300 g      │ │
│Estimate vs reality (estimate)    │          │ │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│ │
│[rows: name / bar / figure]       │          │ │ PERIOD: OCT 12 – NOV 10 · 29 DAYS · 25 LOGGED                                    │ │
│verdict foot                      │          │ │ Your scale lost 331 g less than estimated — the burn estimate looks ~90 kcal/day │ │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          │ │ high. (…)                                                                        │ │
│MACROS                            │          │ └──────────────────────────────────────────────────────────────────────────────────┘ │
│Macros · weekly average…          │          │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│[stacked 240px]                   │          │ MACROS          Macros · weekly average per logged day         [stacked, 280px]      │
```

- **Panel head:**
    - Keep the `.range-label` markup with its `<small>` child (the E2E reads it).
      The date span is set in `--fs-h2`; the `<small>` is `display:block` and styled
      as the mono eyebrow "{N} DAYS · {TZ}", directly under the date span. The
      wireframe's eyebrow-above placement is optional; below is fine.
    - `.range-label` text "Oct 12 – Nov 10" in `--fs-h2`.
    - `.seg` right-aligned at ≥ 700px, full width at < 700px.
- **Summary strip:** the 4-cell ruled strip, 2×2 at < 700px and 4 columns above.
  Content as round 2. The Net est. change figure has the gain/loss dot and its sign.
- **Section eyebrows:** ENERGY (Calories), BALANCE (Estimated body change),
  CALIBRATION (Estimate vs reality), MACROS (Macros). Titles, notes and legends as
  round 2. Notes are `--fs-small` `--ink-2`, with the first sentence of the Calories
  note in `--ink` 600.
- **Legend** (`.legend`): Instrument 500 0.8125rem `--ink-2`, 12px swatches, with shape
  cues kept:
    - square = bar
    - 2px ink line = goal
    - dashed slate = resting
    - slate tick = workout/active
    - hollow slate ring = est. burn
    - hatched square = over
      Items are separated by `var(--s4)` and wrap.
- **Charts** (all `svg.chart`, real pixels):
    - Plot heights: Calories 240 (≤ 480) / 280; Body change 160 / 180; Macros 240 / 280.
    - Gridlines are 1px `--line-2`, with no gridline at 0. The baseline/zero line is
      **1px `--rule`**.
    - Y ticks: Geist Mono 12px `--ink-3`, right-aligned in a gutter sized to the widest
      tick (`maxChars × 7.2px + 8`).
    - **Goal:** a **2px `--rule` step line**, end-labelled "GOAL 2,022" in Geist Mono
      500 12px `--ink` on a `--bg` halo (the paint-order stroke trick, as now).
    - **Burn:** resting = 1.5px dashed `--burn` (4 3); active = a 3px `--burn`
      segment; total = a hollow ring r = min(4, col/3), stroke 2 `--burn`, fill
      `--bg`. Keep `.m-rest` / `.m-active`.
    - **Over:** the above-goal segment filled `url(#hatch-over)` (45°, 2px `--over`
      stripes, 4px period, `--over-tint` ground). The pattern stays in the one shared
      hidden `<defs>` SVG.
    - In-progress day/bucket at opacity 0.55.
    - **Body change:** bars `--gain` up / `--loss` down, square. Direct labels are
      Instrument 600 12px `--ink`, two lines ("−194 g" over "−1,499 kcal"), placed
      outside the bar end. Shown only when the column is ≥ 64px wide; otherwise the
      tooltip carries them.
    - **Macros:** stacked protein / carbs / fat, square, 2px `--bg` gap.
- **Estimate vs reality:** a Facts-style sub-panel (surface, `--r-panel`, 1px line, no
  shadow).
    - Rows: name (`--fs-label`) with sub (`--fs-foot`), a diverging track (6px,
      `--surface-2`, 1px `--rule` zero tick), and the figure right (`--fs-row`
      tabular).
    - Then a 5px `--rule`, the mono period line, and the verdict as `--fs-small`
      `--ink` prose (no tinted box).
    - All states and copy as §4.11. "→" becomes "–" (§4.2.4).

#### 4.4.4 Body

```
390px                                         1440px
│ ◯Today ılTrends ◰Body ≡Meals     │          ┌ grid: 5fr / 7fr ───────────────────────────────────────────────────────────────┐
│┌────────────────────────────────┐│          │┌ Facts panel ──────────────────────────┐ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
││ Weight          (+ Log weight) ││          ││ Weight                 (+ Log weight) │ TREND                                  │
││────────────────────────────────││          ││───────────────────────────────────────│ Weight · since Aug 13                  │
││ Serving size you, in kg  NOV 10││          ││ Serving size you, in kg   LOGGED NOV 10│ 35 weigh-ins since Thu, Aug 13, in kg. │
││████████████████████████████████││          ││███████████████████████████████████████│ ━ Weight  ┄ Target  ▒ Healthy BMI range│
││ [#lw-form opens here, inline]  ││          ││ [#lw-form inline when open]           │  84.6 ┼                                │
││ Current               81.7 kg  ││ .w-now   ││ Current                       81.7 kg │       │●●─●──●─●●──●─●─●●───●─●─●●──●    │
││ logged Tue, Nov 10             ││          ││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│  79.5 ┼                                │
││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬││          ││ Change                       −1.8 kg │       ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ TARGET 78.0 ┄┄ │
││ Change              −1.8 kg    ││          ││   over 89 days · −0.14 kg/week        │  76.9 ┼━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
││   over 89 days · −0.14 kg/week ││          ││ To target                     3.7 kg │        AUG 13                   NOV 10 │
││ To target            3.7 kg    ││          ││   est. Wed, May 12 at this rate       │                                        │
││   est. Wed, May 12 at this rate││          ││ BMI                   25.8 Overweight │                                        │
││ BMI          25.8 Overweight   ││          ││ Healthy range           58.6–78.9 kg │                                        │
││ Healthy range   58.6–78.9 kg   ││          ││   BMI 18.5–24.9 at 178 cm             │                                        │
││   BMI 18.5–24.9 at 178 cm      ││          ││ Resting burn (est.)       1,755 kcal │                                        │
││ Resting burn (est.) 1,755 kcal ││          ││   BMR · Mifflin-St Jeor · age 36      │                                        │
││   BMR · Mifflin-St Jeor · 36   ││          ││ Est. burn today           1,859 kcal │                                        │
││ Est. burn today    1,859 kcal  ││          ││   resting + today's active kcal       │                                        │
││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬││          ││▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│                                        │
││ foot                           ││          ││ foot                                  │                                        │
│└────────────────────────────────┘│          │└───────────────────────────────────────┘                                        │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (left column, under the panel)        │
│TREND  Weight · since Aug 13      │          │ Body details                         + │  details/summary, FAQ grammar          │
│[chart 220px]                     │          │ (form: ruled 2-col grid of fields)     │                                        │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│          └──────────────────────────────────────────────────────────────────────────────────┘
│Body details                    + │          481–1023: one column like 390; the panel max-width 640px; the chart full width
└──────────────────────────────────┘
```

- **Panel:**
    - Title "Weight", with a secondary pill "+ Log weight" (`#lw-open`) on the right.
    - Serving line "Serving size **you, in kg**" (or lb), with the mono date tag
      "LOGGED NOV 10" on the right.
    - Then the 10px bar. `#lw-form` opens **here**, between the bar and the headline
      row, as a ruled 2-column field grid (weight + unit toggle | date-time | note full
      width), with Log / Cancel pills and `#lw-status`. Keep all behaviour.
    - **Headline row** `.w-now`: label "Current" with the sub "logged {date}", and the
      figure in `--fs-hero` inside the `<b>` (the E2E reads `.w-now b`), with the unit
      small.
    - Then the rows listed in the wireframe, each with every round-2 foot variant
      ("No weigh-ins", "Ask Claude to log your weight", "Add details", "Needs a
      weigh-in", "Needs 2+ weigh-ins…", "At target", "Current trend is not heading
      there", "Target x"). A missing value is the figure "—" in `--ink-3` with its
      action text as the `.sub` row.
    - BMI: the figure, then the category as Instrument 500 `--ink-2` text (not
      colour).
    - **Footnote:** "BMI and burn are estimates from your height, birth date and sex."
- **`.notice`** (missing details): `--warn` 3px left rule, `--ink` text and the bold
  lead in `--warn`, placed above the panel. The copy is unchanged.
- **Weight chart:**
    - Line 2px `--accent`, dots r 3.5 `--accent` with a 1.5px `--bg` ring.
    - Target 1.5px dashed `--ink-2`, labelled "TARGET 78.0" in mono 500 12px.
    - Healthy band `--accent-soft`; the baseline is a 1px `--rule`.
    - Start/end dates in mono `--ink-3`. Tooltip as round 2.
- **Body details** (`details.body-box`):
    - Summary: a 3px `--rule` top, Bricolage 700 `--fs-h2` "Body details", and a mono
      "+" on the right that rotates 45° when open (reference FAQ).
    - Note in `--fs-small`. Fields in a 2-column grid at ≥ 481 (Height + unit select |
      Birth date | Sex), 1 column at ≤ 480. Labels are mono eyebrows.
    - Save is a primary pill. `#b-status` follows the round-2 states. Auto-open logic
      unchanged.

#### 4.4.5 Meals

```
390px                                          1440px
│ ◯Today ılTrends ◰Body ≡Meals     │           │ 30 DAYS · AMERICA/NEW_YORK                                ( 7 DAYS |▓30 DAYS▓| 1 YEAR ) │
│ 30 DAYS · AMERICA/NEW_YORK       │           │ Oct 12 – Nov 10                                                                        │
│ Oct 12 – Nov 10                  │           │ TIME     MEAL       DESCRIPTION                          KCAL    P    C    F  FIB  SUG    │ mono head, 1px rule
│ ( 7 DAYS |▓30 DAYS▓| 1 YEAR )    │           │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ 3px rule
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ 3px       │ TUE, NOV 10                                   1,240 kcal  P 95 · C 113 · F 46 · Fib 20      │ day row on surface-2
│TUE, NOV 10            1,240 kcal │           │ 12:40    Lunch      Turkey and swiss on rye, apple         818   66   68   32    9   17 (Edit)│
│P 95 · C 113 · F 46 · Fib 20      │           │ ───────────────────────────────────────────────────────────────────────────────────────── │
│12:40  Lunch            818 kcal  │ tr.meal   │ 08:10    Breakfast  Oats with berries and whey             422   29   45   14   11   14 (Edit)│
│Turkey and swiss on rye, apple    │ (flex)    │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│P 66 · C 68 · F 32 · Fib 9 · Sug 17 (Edit)│ │ MON, NOV 9                                    2,109 kcal  P 164 · …                        │
│──────────────────────────────────│ hairline  │ …                                                                                        │
│08:10  Breakfast        422 kcal  │           │ FRI, OCT 23 · PARTIAL — OLDER MEALS NOT SHOWN                                            │
│…                                 │           │ Showing the 50 most recent meals in this range — the dashboard lists at most 50.         │ foot
```

- **Table at ≥ 1024:** no outer card. The table sits on the page.
    - `thead`: mono eyebrows `--ink-3`, numeric columns right-aligned.
    - Each day `tr.day`: a 3px `--rule` top border, `--surface-2` fill, the date in a
      mono eyebrow (`--ink`), and the total right: kcal in Bricolage 700 `--fs-row`,
      macros in mono `--ink-2`.
    - `tr.meal`: 1px `--line` bottom.
        - Time: mono `--ink-3`, 24-hour-or-locale as now.
        - Type: Instrument 600.
        - Description: Instrument 400, wraps, max ~48ch.
        - `td.k`: Instrument 600 tabular. Macros: Instrument 400 tabular `--ink-2`.
    - Row hover `--surface-2`.
- **Editor:** the editing row gets `--surface-2` and a 2px `--accent` left inset
  (`box-shadow: inset 2px 0 var(--accent)`). `#me-form` is a ruled field grid
  (description full width; type, eaten-at; kcal, P, C, F, fiber, sugar in 4 columns
  at ≥ 1024, 3 at 481–1023, 2 at ≤ 480). Save / Cancel pills. `#me-status` and
  `.meal-flash` as now. Treat stays in `#me-type`.
- **≤ 1023:** `tr.meal` keeps `display: flex; flex-wrap: wrap` (E2E). The day header
  is the 3px rule plus a mono date and the total on the next line, as in the 390
  wireframe. The Edit pill sits on the macro line, right-aligned. There are **no
  card boxes** around meals.
- **"Partial" hint:** mono `--warn` "PARTIAL — OLDER MEALS NOT SHOWN" beside the date.
  **Footer:** `--fs-foot` `--ink-3`, left-aligned, copy unchanged.
- **Empty:** "No meals logged in this range." under the head.

#### 4.4.6 Chart x-label density (mono is 7.2px per character at 12px)

- Labels per axis = `max(2, floor(plotW / (maxLabelChars × 7.2 + 16)))`. Evenly
  pick indices, always including the first and last.
- **Weekly buckets:** label = "OCT 14–20" (span) when `plotW / buckets ≥ 80px`.
  Otherwise use the start date only ("OCT 14"); the tooltip keeps the full span and
  "n of m days logged".
- **Monthly buckets:** "NOV" (and "NOV '25" for a month not in the current year). The
  partial current month gets a trailing "*" and the tooltip says "so far".
- **Daily (7 days):** "MON 9" at ≥ 64px per column, otherwise the initial "M".
- All labels are uppercase mono `--ink-3`; the in-progress label is `--ink` 500.

### 4.5 States

| State                  | Treatment                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover                  | Text links/tabs → `--ink`. Secondary pill border → `--ink`. Primary → `--accent-text` fill. Strip/table rows → `--surface-2`. Charts show the guide line and tooltip (mouse). Panels never move.                                                                                |
| Focus-visible          | `outline: 2px solid var(--focus-ring); outline-offset: 3px; border-radius: 6px` on every interactive element, including tabs, segments, chart svgs, `summary` and the panels. Never removed.                                                                                    |
| Active                 | Buttons translateY(1px); none under reduced motion.                                                                                                                                                                                                                             |
| Disabled               | Opacity 0.5, `cursor: default`; segments `aria-disabled` with a spinner (unchanged).                                                                                                                                                                                            |
| Saving / saved / error | `#b-status`, `#lw-status`, `#me-status`: "Saving…" `--ink-2`, "Saved." `--accent-text` with a 7px dot (fades after 4s), errors `--over` Instrument 600. `.lw-flash` / `.meal-flash`: a mono `--accent-text` "SAVED" tag that fades.                                             |
| Loading skeleton       | Shapes mirror the new layout: a Facts panel outline with ruled bars (10px/5px blocks in `--line`) and row blocks; on Trends, rule + title + chart blocks. Fill `--bg-alt`, a 1.4s sweep of `--surface-2`, static under reduced motion.                                          |
| Refetch                | `.refreshing` dims the panel body to 0.55 (unchanged behaviour).                                                                                                                                                                                                                |
| Empty                  | The round-2 copy, set as `--fs-small` `--ink-2` prose under the section head. No illustration and no emoji.                                                                                                                                                                     |
| API error              | `.banner`: `--surface`, 1px `--over` border, `--r-input` radius, the message in `--ink`, a Retry secondary pill (`data-retry`).                                                                                                                                                 |
| 401                    | Sign out to login (unchanged).                                                                                                                                                                                                                                                  |
| Tooltip `#tip`         | `--surface`, 1px `--line`, a **3px `--rule` top**, `--r-tip`, `--shadow-float`, padding 10/12, max-width 260px. Date in a mono eyebrow. Rows: label `--ink-2` left / value Instrument 600 tabular right. Total row after a 1px rule. Kept within the viewport; pinned on touch. |
| Chips                  | `.chip`: mono 500 0.6875rem uppercase +0.06em, 999px, 1px border. `.chip.over` is `--over` text and border on `--over-tint`; `.chip.est` is `--ink-2` / `--line`.                                                                                                               |

### 4.6 Motion

The easing is `--ease-out: cubic-bezier(.22,1,.36,1)` (the reference's).

| What                                 | Effect                                                                                               | Duration / delay                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| First render after data / tab switch | Direct children of the visible panel rise 10px→0 and fade in, staggered                              | 320ms each, steps of 50ms, capped at 5 |
| Facts rules                          | The 10px and 5px bars draw `scaleX(0→1)` from the left (transform-origin left), on first render only | 500ms, after 80ms                      |
| Ring                                 | stroke-dashoffset sweep                                                                              | 700ms                                  |
| Nutrient bars                        | `scaleX(0→value)` from the left                                                                      | 500ms, staggered 40ms                  |
| Chart bars                           | `scaleY(0→1)` from the baseline, **first render of a panel only**, never on range change             | 400ms, staggered 12ms, capped at 240ms |
| Hero figure                          | Nice-to-have: count up from 0 to the value (`requestAnimationFrame`, ease-out)                       | 600ms                                  |
| Details "+"                          | rotate 45°                                                                                           | 250ms                                  |
| Tooltip                              | opacity                                                                                              | 100ms linear                           |
| Header shrink / hairline             | height and border-color                                                                              | 300ms                                  |

Under `prefers-reduced-motion: reduce`, every animation and transition is
`0.01ms` (the reference's rule). Figures render at their final value, rules at full
width and skeletons static. Motion must never delay the E2E's `settled()`, which waits
on `.skel` and `.refreshing`, nor axe: animations finish within 600ms.

### 4.7 Accessibility (in addition to archive §4.9, which stands)

- The Facts panels are `<section aria-labelledby>`. Their rows are a `<dl>` of
  `<div class="facts-row"><dt>…</dt><dd>…</dd></div>` (valid HTML: `div` groups inside
  `dl`). `.sub` rows are `<div class="facts-row sub">` with their own `dt`/`dd`.
  Screen readers must read "Goal 1,904 kcal" in order.
- The decorative rules are borders, not elements. The brand mark and icons are
  `aria-hidden`.
- Colour is never the only cue (archive §4.2 rules): hatch plus "over", sign plus
  direction, the tab underline plus weight, and the BMI category as text.
- axe: zero serious or critical violations, Lighthouse accessibility ≥ 95, in both
  themes, at 390 and 1440.

### 4.8 Nice-to-haves (not required)

- N-a: the reading-progress hairline on the sticky bar.
- N-b: the hero count-up.
- N-c: the pulsing "SO FAR" dot.
- Archive N1 and N3–N5 remain optional, as before.

---

## 5. Architecture requirements

### 5.1 API

**No change** to any `/api/dashboard/*` path, payload or status code. No new endpoint
other than the static font route.

### 5.2 Fonts and CSP: the minimal backend touch

**`src/dashboard.ts`.** Add three exports beside `createDashboardRouter()`:

```ts
// The /dashboard page's CSP: the server default (src/index.ts) with font-src
// narrowed to 'self', because the page self-hosts its fonts and must make no
// third-party request. src/dashboard-fixture.test.ts checks it differs from
// the default only in font-src.
export const DASHBOARD_CSP =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self'; img-src 'self'; frame-ancestors 'none'";

// Allowlist of the self-hosted dashboard fonts (public/dashboard-fonts/,
// OFL texts alongside). Versioned names: the bytes never change under a name,
// which is what makes the immutable cache safe.
export const DASHBOARD_FONTS: ReadonlySet<string> = new Set([
    "bricolage-grotesque-latin-v9.woff2",
    "instrument-sans-latin-v4.woff2",
    "geist-mono-latin-v6.woff2",
]);

// One implementation for production and the preview. null = not ours (404).
export function dashboardFontResponse(file: string): Response | null {
    if (!DASHBOARD_FONTS.has(file)) return null;
    return new Response(Bun.file(`./public/dashboard-fonts/${file}`), {
        headers: {
            "Content-Type": "font/woff2",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
```

- The CSP string must be **one double-quoted literal** exactly as above (the test
  reads it as text).
- Inside `createDashboardRouter()` add
  `dash.get("/dashboard-fonts/:file", (c) => dashboardFontResponse(c.req.param("file")) ?? c.notFound());`.
  It is **unauthenticated** (the login card needs the fonts, and font fetches carry no
  bearer), not rate-limited, and exists only when the dashboard is mounted. The
  allowlist lookup is the only path check: no path is ever built from unchecked input.
- Use the relative path `./public/dashboard-fonts/…` exactly as above. It matches how
  `src/index.ts` already serves `./public/dashboard.html` (cwd = repo root, in Docker
  `/app`), and the preview is run from the repo root too.

**`src/index.ts`**, inside `if (dashboardEnabled())` only:

```ts
app.get("/dashboard", async (c) => {
    c.header("Content-Security-Policy", DASHBOARD_CSP);
    return c.html(await Bun.file("./public/dashboard.html").text());
});
```

Add `DASHBOARD_CSP` to the existing import from `./dashboard.js`. The global
security-header middleware only sets its default CSP when none is present, so this
header wins. Nothing else in `index.ts` changes; the default CSP literal stays as it
is.

**`scripts/dashboard-preview.ts`:**

- Replace the `PREVIEW_CSP` literal with
  `import { DASHBOARD_CSP, dashboardFontResponse } from "../src/dashboard.js";` and
  `export const PREVIEW_CSP = DASHBOARD_CSP;`. Importing `src/dashboard.ts` is safe:
  Supabase is lazy, and the preview already blanks the env.
- Add, before the 404 fallthrough:
  `if (req.method === "GET" && path.startsWith("/dashboard-fonts/")) return dashboardFontResponse(path.slice("/dashboard-fonts/".length)) ?? new Response("Not found", { status: 404 });`
- The preview is already running with `--watch` on 8791. Restart it after editing
  `scripts/` or `src/` if the watcher does not pick up the change.

**`src/dashboard-fixture.test.ts`:** replace the "same CSP string" test with one that
reads files as text (no import of the preview, which would start its server):

```ts
test("the dashboard CSP is the default with font-src 'self', shared by prod and preview", async () => {
    const index = await Bun.file("src/index.ts").text();
    const dash = await Bun.file("src/dashboard.ts").text();
    const preview = await Bun.file("scripts/dashboard-preview.ts").text();
    const parse = (s: string) =>
        Object.fromEntries(
            s
                .split(";")
                .map((d) => d.trim())
                .filter(Boolean)
                .map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]),
        );
    const def = /"(default-src [^"]+)"/.exec(index)?.[1];
    const csp = /DASHBOARD_CSP =\s*"([^"]+)"/.exec(dash)?.[1];
    expect(def).toBeDefined();
    expect(csp).toBeDefined();
    const a = parse(def!),
        b = parse(csp!);
    expect(b["font-src"]).toBe("'self'");
    expect({ ...b, "font-src": a["font-src"] }).toEqual(a);
    expect(index).toContain(
        'c.header("Content-Security-Policy", DASHBOARD_CSP)',
    );
    expect(preview).toContain("PREVIEW_CSP = DASHBOARD_CSP");
});
```

**New `src/dashboard-fonts.test.ts`:**

- Build `createDashboardRouter()` and `app.request()` each allowlisted file. Expect
  200, `content-type: font/woff2`, a cache-control containing `immutable`, and a body
  byte length equal to the file on disk. Send **no** Authorization header.
- `/dashboard-fonts/unknown.woff2`, `/dashboard-fonts/..%2Fdashboard.html` and
  `/dashboard-fonts/OFL-GeistMono.txt` return 404.
- Each allowlisted file starts with the woff2 magic `wOF2`, and each has an `OFL-*.txt`
  beside it in `public/dashboard-fonts/`.
- Do not `mock.module` anything in this file (CLAUDE.md's process-wide mock rule).

### 5.3 Files and workflow

- Source = output = `public/dashboard.html`, tracked and hand-written, formatted by
  Prettier. `public/dashboard-fonts/` is tracked: binary woff2 files plus OFL `.txt`.
  Prettier ignores both types; check that `bun run format:check` stays green.
- **Dev:** edit the HTML and refresh http://localhost:8791/dashboard. The E2E runs
  against a second preview on 8793 (archive IMPLEMENTATION_LOG, "How to look at it").
- **Prod:** no Dockerfile or compose change. Promotion is the user's call.

### 5.4 Order of work

1. Baseline: run the E2E on the unmodified page and record the result.
2. Fonts: download and verify the hashes, add the files and OFL texts, the route, the
   CSP, the preview and the tests. `bun test` must be green.
3. **Style tile:** a throwaway `/tmp/style-tile.html` that loads the three woff2 files
   from the repo by `file://` path and shows the tokens (light and dark), the type scale,
   one Facts panel (Today), one ruled strip, a section head with a chart stub, buttons,
   segments and a chip. Screenshot it at 1440 in both themes as
   `docs/redesign/screenshots/style-tile-{light,dark}.png`, next to
   `reference-facts-{light,dark}.png`, and score it (§6.3) **before** touching the
   views. Do not commit the tile HTML.
4. Tokens, fonts, base, chrome (header, tabs, seg, buttons), login.
5. Today → Trends → Body → Meals. Run the E2E after each one.
6. States, motion, glyph substitutions, a11y pass, screenshots, scores and the log.

---

## 6. Acceptance criteria

### 6.1 Functional and technical

- [ ] **Feature parity:** archive §1.1 row by row plus §1.2 here, every state included
      (login 401/429/network, empty, `no-body`, `no-goals`, `over-goal`, `lb`/Tokyo,
      `calibrate`, `?delay=2000` skeletons, `?fail=500` banner + Retry, `?fail=401` →
      login). Ticked in `IMPLEMENTATION_LOG.md`.
- [ ] `scripts/dashboard-e2e.ts` is green on two consecutive runs. Checks were changed
      only as §6.2 allows, and each change is listed in the log.
- [ ] `bun test`, `bun run typecheck` and `bun run format:check` are green, including
      the new CSP and font-route tests.
- [ ] **Network:** every request goes to the page's own origin. The three woff2 files
      return 200 from `/dashboard-fonts/` and no other font request happens (E2E
      request log plus Claude in Chrome's network panel). Zero CSP violations and zero
      console errors or warnings in every scenario and both themes.
- [ ] **Fonts render:** after `document.fonts.ready`, `[...document.fonts]` contains
      Bricolage Grotesque, Instrument Sans and Geist Mono with `status === "loaded"`,
      and computed `font-family` on `.w-now b`, body text and a `.seg` button starts
      with the right family. UI strings contain none of the missing glyphs listed in
      §4.2.4 (`perl -CSD` grep of the HTML outside comments).
- [ ] The `/dashboard` response carries `DASHBOARD_CSP` in production (in-process
      `app.request` check with `DASHBOARD_ENABLED=true` and Supabase env blanked) and
      in the preview.
- [ ] Tokens are exactly §4.1 (or changed with recomputed contrast in the log),
      declared in the light, media-dark and `[data-theme="dark"]` blocks. The toggle
      wins both ways, with no dark-mode flash on reload.
- [ ] At 390px: no horizontal scroll on any tab or scenario; chart text ≥ 12px
      rendered; no overlapping x labels at 7 days, 30 days and 1 year; tabs ≥ 44px;
      inputs 16px; tap-to-pin works.
- [ ] axe: zero serious or critical violations on every tab and the login, in both
      themes, at 390 and 1440, in `full` and `empty`. Lighthouse accessibility ≥ 95 on
      Today and Trends (run it this time; round 2 skipped it).
- [ ] Every estimate stays labelled "est."/"estimate". Colour is never the only cue.
- [ ] No mutation of protected data. Only the fixture preview is used.
- [ ] `git diff --stat` is limited to the files in §0.

### 6.2 E2E changes the implementer may make

- **Add:** (a) font-loaded and family assertions as in §6.1; (b) a check that each
  `/dashboard-fonts/*.woff2` response is 200 `font/woff2` from the same origin; (c) a
  390px x-label non-overlap check on `#cal-plot` (the bounding boxes of the x-label
  `text` elements do not intersect) at all three ranges.
- **May change:** a selector whose element was legitimately restructured (for example
  `.trio.two` → `[data-last7]`), keeping the same assertion text and intent.
- **May not change:** any assertion about copy, payloads, states, network or a11y, or
  the 12px / 16px / `display:flex` checks.

### 6.3 Screenshots and design-quality scores

- [ ] `docs/redesign/screenshots/reference-hero-light.png`,
      `reference-facts-{light,dark}.png` and `reference-features-dark.png`, captured
      from https://nutrition.labucu.com/ at 1440.
- [ ] `style-tile-{light,dark}.png` (step 3, before the views).
- [ ] Final screenshots: `login`, `today`, `trends`, `body` and `meals` at 390×844 and
      1440×900, light and dark (`full`); plus `today-empty`, `today-over-goal`,
      `body-no-body`, `meals-edit` and `body-log-weight` at 390 light, and
      `trends-tooltip-390-light.png` (pinned).
- [ ] `IMPLEMENTATION_LOG.md` scores each view (Login, Today, Trends, Body, Meals)
      from 1 to 5 against the reference screenshots, with one sentence of evidence per
      score. **Every score ≥ 4**, or the view is reworked:
    - **Typography:** three faces visibly load; tight Bricolage display; tabular
      figures; mono eyebrows and axes.
    - **Colour:** tinted paper and forest dark; brand-derived series; no banned stock
      hexes; amber calories.
    - **Signature motif:** the 10/5/3/1px rule hierarchy is visible as structure on
      every view; Today and Body are Facts panels.
    - **Hierarchy and rhythm:** one obvious hero per view; consistent spacing; no card
      soup (no free-floating tile cards anywhere).
    - **Detail:** hover, focus and active states; empty states with real copy; balanced
      headings; aligned numbers; no overlapping labels.
    - **Motion:** reveals and rule-draws present; all off under reduced motion
      (verified with emulation).
    - **Side by side:** Today 1440 next to `reference-facts-light.png` reads as the same
      product at the same level of craft.
- [ ] The user reviews the localhost preview before any promotion.

---

## Sources

- Reference site, fetched and screenshotted 2026-11-10: https://nutrition.labucu.com/
  and https://nutrition.labucu.com/styles.css (identical to the repo's
  `public/styles.css`).
- Google Fonts CSS API response for the reference's font URL (2026-11-10):
  https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Geist+Mono:wght@400;500&display=swap
- OFL texts: https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/OFL.txt,
  https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt,
  https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/OFL.txt
- Google Fonts FAQ (self-hosting, licences): https://developers.google.com/fonts/faq
- OFL-FAQ 1.1-update7 (2023-11): https://openfontlicense.org/ofl-faq/
- Google Fonts guide, license file: https://googlefonts.github.io/gf-guide/license-file.html
- web.dev, Optimize web fonts: https://web.dev/learn/performance/optimize-web-fonts
- web.dev, Preload web fonts: https://web.dev/articles/codelab-preload-web-fonts
- MDN, font-synthesis: https://developer.mozilla.org/docs/Web/CSS/font-synthesis
- Round-2 sources (IA, APG tabs, HIG) remain in `archive/round-2/REQUIREMENTS.md`.
- In-repo: `public/styles.css`, `public/dashboard.html` (`9c3e59f`),
  `scripts/dashboard-e2e.ts`, `src/index.ts`, `scripts/dashboard-preview.ts`,
  `src/dashboard-fixture.test.ts`.

## User approval (2026-11-10)

Approved with the researcher's recommendations on all five open questions: strict
`font-src 'self'`; softer series palette; small calorie ring with percentage; "% of goal"
rows on Today; darker `--ink-3`.
