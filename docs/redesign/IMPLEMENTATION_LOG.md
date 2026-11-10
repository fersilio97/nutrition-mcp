# Dashboard redesign — implementation log

Stage 2 of the redesign, built on branch `worktree-dashboard-daily-goal` against
`REQUIREMENTS.md` (approved 2026-11-09, §0 decisions applied).

## How to look at it

- **Fixture preview:** `bun run dashboard:preview`, then open
  http://localhost:8791/dashboard and sign in with any email and password.
  Scenarios: `?scenario=full` (default), `over-goal`, `no-body`, `no-goals`, `empty`,
  `lb` (Asia/Tokyo, pounds) and `calibrate`. Failure modes: `?delay=2000` and
  `?fail=500|401`. Login errors: `bad@test` (401) and `429@test` (429). A page
  load with any of these params resets the others and forgets Body-form saves;
  a load without them keeps the current state.
- **Real data:** `DASHBOARD_ENABLED=true PORT=8792 bun --watch src/index.ts`, then
  http://localhost:8792/dashboard. See "Real-data check" below for why this was
  not run here.
- **E2E:** install Playwright and axe-core outside the repo
  (`mkdir -p /tmp/dash-tools && cd /tmp/dash-tools && bun add playwright axe-core && bunx playwright install chromium`).
  Start a second preview with `DASHBOARD_PREVIEW_PORT=8793 bun scripts/dashboard-preview.ts`,
  then run `PW_DIR=/tmp/dash-tools bun scripts/dashboard-e2e.ts http://localhost:8793`.
  Add `SHOTS=docs/redesign/screenshots` to regenerate the review screenshots.

## What changed

| File                            | Change                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/dashboard.html`         | Rewritten in place: four APG tabs, tokens, pre-paint theme, real-pixel charts, pointer and keyboard inspection, the Estimate vs reality card, and the 1-year range.                                             |
| `src/dashboard.ts`              | Additive, behaviour-preserving changes: `dashboardWindow()`, `DashboardInputs` and `buildDashboardPayload()` (`dashboardPayload` now fetches and delegates), plus the additive `estimateVsScale` payload field. |
| `src/dashboard-stats.ts`        | New pure `buildEstimateVsScale()` and its `EstimateVsScale` type.                                                                                                                                               |
| `src/dashboard-stats.test.ts`   | 7 tests for it: fully covered span, its mirror (sign), a gappy span (scaled figure), a short span, last-day and in-progress exclusion, fewer than 2 weigh-ins, and the no-estimate state.                       |
| `src/dashboard-fixture.ts`      | New. Seeded, pure scenario generator plus `previewInputs()`, which applies production's window filters.                                                                                                         |
| `src/dashboard-fixture.test.ts` | New. 7 scenarios × days 1/7/30/90/365 window invariants, a claim per scenario (calibrate lands at 120–180 kcal/day), CSP sync with `src/index.ts`, and determinism.                                             |
| `src/mcp.test.ts`               | One new test inside the existing `dashboard API` describe: a deep-key drift guard comparing the preview payload with the real one. Existing tests are unmodified.                                               |
| `scripts/dashboard-preview.ts`  | New dev-only preview server. It blanks the Supabase env, so an accidental call throws.                                                                                                                          |
| `scripts/dashboard-e2e.ts`      | New dev-only Playwright and axe E2E. Not part of `bun test`.                                                                                                                                                    |
| `package.json`                  | One script: `dashboard:preview`.                                                                                                                                                                                |
| `docs/redesign/`                | BRIEF, REQUIREMENTS, this log and 24 screenshots.                                                                                                                                                               |

## Deviations from the requirements (and why)

1. **`src/dashboard-stats.ts` and its test are outside the brief's
   `backend_touch_allowed` list and §6's diff allowlist.** §0 and §4.11 require
   them (user decision 2026-11-09), so the user's later decision wins. Nothing
   else in `src/` changed beyond what §5.1 allows.
2. **The sign of `implied_kcal_per_day`.** §4.11 step 5 writes `−gap × 7.7 / span`,
   but the same section says "positive → the burn estimate runs high". Its worked
   example and the `calibrate` "+150" agree with that sentence. With
   `gap = actual − estimate`, only `+gap × 7.7 / span` satisfies all three, so the
   leading minus is treated as a typo. A doc comment on the type says so, and a
   test pins both signs: −400 g vs −800 g over 20 days gives +154, "high".
3. **Weight deltas in pounds stay in pounds.** §4.11 says to show grams under
   1 kg. That rule is applied for `kg` users only, because grams next to a
   pounds profile would be a third unit.
4. **Sign-in keeps a deep link.** §4.9 says "on sign-in success, focus the Today
   tab". §6 also requires `#body` on load to open Body. When a signed-out user
   opens `#body` and signs in, they land on and focus Body. Without a hash it is
   Today.
5. **Mini 7-day strip.** §4.6 says the whole card is a link-button. That would
   swallow the strip's tap-to-pin and keyboard inspection, so the card has a
   "See trends ›" link-button in its header instead.
6. **Range refetch.** §4.7 asks for skeletons "on a range change" and also to
   "keep the previous data visible, dimmed to 0.6". The page shows skeletons on
   first load and dims during a refetch. `?delay=2000` shows both.
7. **One new token, `--over-tint`** (light `#f6d4d5`, dark `#4a1f22`). It is the
   pale ground of the over-goal hatch. The stripes stay `--over`, which is 5.73
   (light) and 6.24 (dark) on surface, so the hatch's contrast is carried by the
   tokens in the §4.2 table. The tint is decorative and is not used for text.
8. **"Daily average" includes today's partial day**, as the old page did (parity).
   "Over goal" and "Net est. change" use complete days only, as §4.6 says.
9. **N1 (water and sugar on Today) was not built**, per §0.

## Bug log (symptom → root cause → fix → verified)

1. Desktop energy trio cramped: "EST. CHANGE" wrapped and units touched the next
   cell. → The trio sat beside a 168px ring in a half-width card. → The trio moved
   full-width under the ring and foot row, and the basis got its own line. →
   1440px screenshot.
2. "Goal 2,252" end label overdrawn by burn markers. → It was appended before
   the circles. → It is now drawn last, with a surface halo. → 390px screenshot.
3. Macro axis ticks 752 / 564 / 376 and a 4,000 top on a 7-day peak of about
   2,700. → `snapToTicks(niceMax(…))` snapped to integers, not to round steps. →
   `tickMax()` picks a step from 1/1.5/2/2.5/3/4/5/6/8/10 × 10ⁿ. → Screenshots at
   7 days, 30 days and 1 year.
4. `#body` opened while signed out landed on Today after sign-in. → The login
   handler forced Today. → It keeps a valid hash tab. → E2E "#body on load opens
   Body".
5. Dark mode showed the moon icon in the theme button. → `SVGElement` has no
   `hidden` property, so `el.hidden = x` only set an expando. → `toggleAttribute`.
   → E2E theme block, and Claude in Chrome in system dark.
6. Body form auto-open could count as the user's own toggle. → A `setTimeout`
   cleared the "programmatic" flag, racing the async `toggle` event. → The toggle
   handler consumes the flag, and the flag is set only when a toggle will
   actually fire. → E2E "form auto-opens when details are missing".
7. Re-running the E2E: `no-body` no longer had missing details. → The preview
   keeps Body-form saves in server memory across page loads. → Any page load
   with scenario params now resets them. → E2E green on consecutive runs.
8. E2E-only: an axe colour-contrast hit on a random tab in `empty`. → axe ran
   during the 160ms panel fade-in. → The E2E waits 250ms, as the main walk
   already did. → `axe1.ts` on the settled page showed 0 violations, and the
   E2E is green.
9. E2E-only: `settled()` timed out after a deep link. → It waited for every
   `.skel`, including a never-visited hidden panel's. → It is scoped to the
   visible panel.
10. Claude in Chrome's network log listed one `data:` GET. → It was not the page:
    `public/dashboard.html` contains no `data:` URI, Playwright's request log
    (which flags any non-origin request, `data:` included) recorded none in 147
    checks, and Chrome showed no CSP violation. It was attributed to the
    extension's own tooling. No change.

## Verification

- `bun test`: 928 pass, 0 fail (34 files). `bun run typecheck`: clean.
  `bun run format:check`: clean.
- `scripts/dashboard-e2e.ts`: **147 checks, all passed**, on consecutive runs.
- Claude in Chrome (new tab, closed after): Today, Trends and Body at 1440 wide,
  in system dark and toggled light. The console was empty, and the only page
  requests were `/dashboard` and `/api/dashboard/data`. Mouse hover tooltips were
  confirmed with Playwright, because the extension's synthetic hover did not
  reach the page. Chrome would not size the window below its minimum, so 390px
  was checked with Playwright.
- The production route was checked in-process (the `app` import, with no boot
  side effects and the Supabase env blanked). `GET /dashboard` returns 200, the
  new shell, the production CSP, and the pre-paint script first in `<head>`.
  Login with `{}` or malformed JSON returns 400 `{"error":"invalid_request"}`.
  `/api/dashboard/data` without a token returns 401 JSON.

### Real-data check (§5.3): not done

- This worktree has **no `.env`**. §5.3 assumed one. The only one is in the main
  checkout, which this session must not touch.
- Running `src/index.ts` as the entrypoint also starts `startExportCleanup()`
  (deletes expired export files in Supabase storage) and
  `seedPatreonTokensFromEnv()` (a write). Both are mutations beyond "log in and
  read".
- Authenticated rendering against real data is therefore **not verified**. The
  user's own sign-in at 8792 is the remaining check.

## Acceptance checklist (§6)

- [x] §0 decisions: 1-year range on Trends and Meals; Estimate vs reality card
      with an empty state, a coverage line, the scaled figure shown only beside
      the logged one, and the calibration gate (≥ 14 days, ≥ 70% logged);
      pure-helper unit tests; the `calibrate` scenario; screenshots committed.
- [x] Feature parity with §1.1, row by row:
    - L: login copy and errors (401 and 429; the network error is coded but not
      exercised).
    - H: header, theme toggle and sign out.
    - S: the sub line, plus the error banner and Retry.
    - R: range control (7/30/90/1y).
    - T: tiles redistributed to Today (ring, trio, nutrients) and Trends (average).
    - C: calories chart with the goal basis, step line, burn markers and every
      tooltip field.
    - B: body change, with today excluded, ≤ 14 direct labels and net over
      complete days.
    - M: macros.
    - W: Body tab stats with every foot variant, including the projection copy.
    - BD: form fields, payload, statuses and auto-open.
    - ML: meals.
    - TT: tooltip.
    - Plus `localStorage` try/catch, a 401 anywhere signing out, `parseDay`,
      `esc()` and the real minus sign.
- [x] Four APG tabs; `#body` deep link; back and forward; range persists; no
      range control on Today or Body.
- [x] Tokens as in §4.2 (plus `--over-tint`, deviation 7), declared in all four
      places; the toggle wins both ways; no theme flash (E2E checks first-paint
      `--bg`).
- [x] Colour never the sole cue: hatch plus "over"/▲; sign plus direction; tab bar
      plus weight.
- [x] Estimates labelled "est."/"estimate": burn, change, net change, resting
      burn, projection and both estimate cards.
- [x] 390px: no horizontal scroll on any tab or scenario; chart text ≥ 12px
      (computed); tap-to-pin; meals as cards; 16px inputs.
- [x] Meal times and today's filter use `data.timezone` (the `lb`/Tokyo scenario
      in a Los Angeles browser).
- [x] Zero foreign requests, zero console errors and warnings in every scenario
      and both themes (Playwright).
- [~] axe: zero serious or critical violations on every tab, both themes, `full`
  and `empty` (plus 390 and 1440 on `full`). **Lighthouse was not run.**
- [x] `bun test`, typecheck and format:check green; the existing dashboard API
      tests are unmodified; the drift guard passes.
- [x] The preview runs with the Supabase env blanked, serves every scenario, and
      handles `?delay=2000` (skeletons), `?fail=500` (banner plus Retry) and
      `?fail=401` (back to login).
- [x] E2E: log in, every tab, every range, Body save (preview only), sign out.
- [ ] Real API checked read-only at 8792: **not done** (see above).
- [x] Screenshots at 390×844 and 1440×900, light and dark: Login, Today, Trends,
      Body, Meals (`full`) and Today (`empty`), committed.
- [~] Diff limited to the allowed files, **except** `src/dashboard-stats.ts` and
  its test (deviation 1) and `scripts/dashboard-e2e.ts` (required by §6's
  E2E item).
- [ ] The user has reviewed the localhost preview: pending.

## Known issues / notes

- The `full` fixture's weigh-ins trend −0.15 kg/week as §5.2 specifies, but its
  eating runs about 600 kcal under the estimated burn. Its Estimate vs reality
  card therefore says the burn estimate looks about 420 kcal/day high. This is a
  fixture artefact; `calibrate` is the scenario tuned to show the card's intended
  reading (about 150 kcal/day high).
- At 1 year on 390px, bars are about 1px wide with no gap, and burn markers merge
  into a line. This is acceptable per §4.7; the tooltip and keyboard give
  per-day values.
- Lighthouse accessibility ≥ 95 is not verified. axe is clean.
