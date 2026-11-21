---
paths:
    - "src/body.ts"
    - "src/calibration.ts"
    - "src/goal-plan.ts"
    - "src/dashboard.ts"
    - "src/dashboard-stats.ts"
    - "src/activity.ts"
    - "src/activity-sync.ts"
    - "src/health-merge.ts"
    - "src/insights.ts"
    - "src/mcp.ts"
    - "public/dashboard.html"
    - "public/widgets/src/**"
---

# Formula map: the rules every surface must respect

These formulas are the product. The dashboard, the MCP tools and the widgets
must compute them the same way. Do not change one, add a variant, or quote a
different version in UI or tool text without the user's explicit approval.
When a change is approved, update this file in the same commit, and ask the
`nutritionist` agent to check both.

Read it top-down: the calorie goal first, then each term it uses, with a link
to where that term is defined. "Known deviations" at the end lists the places
where the code does not yet follow these rules; fix the code, never the rule,
unless the user decides otherwise.

Notation: `d` = a day, `k` = kcal per gram of weight change, `f` = digestion
share of intake, `L` = lookback in days. Every figure is an estimate.

---

## 1. Calorie goal (Body › Calorie goal)

The mode is chosen in Body › Calorie goal (`nutrition_goals.calorie_goal_mode`).

| Mode | Goal for day d |
| --- | --- |
| **Burn** | `(R_d + A_d) ÷ (1 − f)` |
| **Rate** | `(R_d + A_d + rate × k) ÷ (1 − f)` |
| **By date** | `(R_d + A_d + rate × k) ÷ (1 − f)`, rate re-derived daily |
| **Fixed** | `typed goal + A_d` (active added 1:1, not grossed up) |

- `R_d` resting burn → [§2](#2-resting-burn-r-body--body-details--baseline-burn)
- `A_d` goal active kcal → [§4.2](#42-goal-active-a)
- `rate` in g/day, negative = loss → [§6](#6-plan-rate)
- `k` → [§7](#7-model-settings-body--body-details--burn-model)
- `f` → [§3.2](#32-digestion-share-f)

Rules:
- Burn is Rate with `rate = 0`. The `÷ (1 − f)` grosses the goal up for the
  energy spent digesting it: the intake I solves `I = R + A + rate × k + f × I`.
- Every mode except Fixed is derived on read and never stored as a calorie
  number. A legacy row with no mode: a stored number means Fixed, none means Burn.
- Today's `rate`, today's `f` and today's calibration offset apply to every
  row, past days included, so a past day's goal moves when they change.
- **Macros.** Burn, Rate and By date: protein stays at its target; carbs and
  fat scale by `goal_d ÷ base_d`, where `base_d` is the same formula with
  `A = 0`. Fixed: all three macros scale by `(typed + A_d) ÷ typed`.
- **MCP fallback.** If the dashboard payload cannot be built, the tools use
  `BMR ÷ 0.9 + the day's own active` (`withBurnDefault`, `breakEvenKcal`).

## 2. Resting burn R (Body › Body details › Baseline burn)

Two options, chosen in Body details (`profiles.resting_basis`):

| Option | R_d |
| --- | --- |
| **Formula (BMR)** | `BMR_d` → [§2.1](#21-bmr-mifflin-st-jeor) |
| **Calibrated from my data** | `clamp(BMR_d − offset, 0.75 × BMR_d, 1.25 × BMR_d)` when the calibration is trusted ([§5](#5-calibration-the-offset)); otherwise `BMR_d` |

- "Calibrated" is applied only when it is chosen **and** trusted. One offset,
  today's, is used for every day.
- The calibrated figure is not pure BMR. It also absorbs everyday movement
  the watch misses, the watch's average bias and logging error.
- The same R feeds the goal, Est. burn, the safety checks and the intake floor.

### 2.1 BMR (Mifflin-St Jeor)

`BMR_d = 10 × kg + 6.25 × cm − 5 × age + 5` (male), or `− 161` (female)

- kg = the last weigh-in on or before d, else the earliest one known.
- age = whole years on day d. No activity multiplier (`BASE_FACTOR = 1`).

## 3. Digestion (thermic effect of food)

### 3.1 A day's digestion TEF_d

`TEF_d = 25% × protein kcal + 7.5% × carb kcal + 2% × fat kcal + 10% × unexplained kcal`

- Protein and carbs are 4 kcal/g and fat 9 kcal/g. "Unexplained" is the kcal
  the macros don't account for (alcohol, rounding).
- If the macros explain under half the day's kcal: `TEF_d = 10% × kcal`.

### 3.2 Digestion share f

`f = Σ TEF_d ÷ Σ intake_d` over the counted days ([§5.1](#51-which-days-count))
with kcal > 0 in `[today − L, yesterday]`, held to 5–20%. `f = 10%` until there
are 7 such days. One f, today's, is used for every row.

## 4. Active kcal

### 4.1 A day's active kcal

From Apple Health via the iOS Shortcut (`/api/activity`), capped at 5,000 kcal.

- Sources are ranked Garmin, then anything named "watch", then iPhone, then
  other apps. A lower source counts only for time no higher one covers.
- Garmin mode **workouts** (default): Garmin wins only inside workout blocks
  (≥ 60 kcal/h). Its low "filler" blocks count only on a day with no other
  source. **All day**: Garmin wins wherever it has a sample.
- A day is dated by when its samples start.
- A day the watch never synced is **unknown (null), never 0**.

### 4.2 Goal active A

`A_d` = the day's own active kcal once it is above 0 (a 0 counts as "not
synced yet"). Until then, it is the mean active kcal of the counted days with
a watch figure in `[d − L, d − 1]`. That mean needs 7+ such days; with fewer,
A is the day's own figure, or 0.

## 5. Calibration (the offset)

The window is the `L` days ending yesterday. It always reads formula-BMR rows,
never already-calibrated ones.

### 5.1 Which days count

- Automatic: **2+ entries and at least 50% of the median logged day**. The
  median is over the days with meals in the window; with fewer than 7 such
  days only the 2+ entries test applies.
- Never counted: today, and a day with no meals.
- A day the watch didn't sync is left out automatically for a watch user (a
  user with active kcal on any fetched day).
- The Meals-tab "Count this day in analysis" toggle overrides the automatic
  rule, including the unsynced-watch rule. Such a day's active then counts as 0.

### 5.2 The steps

1. Weight slope: a least-squares line through the daily mean weigh-ins in the
   window gives g/day ± SE.
2. `TDEE = mean intake − slope × k`, over the counted days d with
   `first weigh-in ≤ d < last weigh-in`.
3. `baseline = TDEE − mean active − mean TEF` (an unsynced active counts as 0).
4. `offset = mean BMR − baseline` (positive = the formula runs high).
5. Every day d: `R_d = BMR_d − offset`, clamped to ±25% of `BMR_d` (§2).
6. Uncertainty `= SE × k`. It covers scale scatter only, not logging error,
   and scale water swings make it optimistic.

It is trusted only when all of these hold:
- the span is ≥ 21 days
- there are ≥ 8 weigh-in days
- counted days ÷ span ≥ 70%
- the uncertainty is ≤ ±150 kcal/day
- every counted day has a BMR

## 6. Plan rate

| Mode | rate (g/day) |
| --- | --- |
| Rate | the user's amount ÷ days in its period (a week is 7; a month and a year use calendar averages) |
| By date | `(target − trend weight today) ÷ days left`, recomputed every day |
| Burn, Fixed | 0 |

By date gives a rate of 0 when any of these holds:
- the trend is within 0.5 kg of the target
- 0 or fewer days are left (the target date itself included)
- there is no weigh-in at all
- the target or the date is missing

### 6.1 Trend weight today

1. A least-squares line through the weigh-ins from `today − L` to today, used
   once they span 14+ days on 3+ days. Its value on the newest weigh-in day is
   held inside the range of the daily means of the 7 days ending on that
   newest day. It then runs forward by `min(7, days since the newest weigh-in)`.
2. Otherwise, the mean of the daily means in the 7 days ending today (needs
   2+ readings; two on the same day qualify).
3. Otherwise, the latest reading.

## 7. Model settings (Body › Body details › Burn model)

- `k`, kcal per gram of weight change: default **6.0**. A few weeks of scale
  change is fat, lean tissue and water together. Adipose tissue is about 7.7,
  and pure fat is 9. Allowed range: **5–7.7** (the What-if lab already uses
  it; see Known deviations).
- `L`, the lookback: default **42** days, allowed 21–56.
- One `k` and one `L` drive all of these together: the calibration, `f`, `A`,
  the trend weight, the goal, the gram balance and the Resting metabolism
  chart. Never use one value in one place and another elsewhere.
- 6.0 is right for a few weeks of change and slightly optimistic for
  months-long loss plans, where lost tissue approaches adipose. Calibration
  partly corrects for this.

## 8. Figures derived from the above

- **Est. burn** `= R_d + active_d (unsynced = 0) + TEF_d`. It uses the day's
  real TEF, not f. The Today tab, the Trends tab and the Body tab must show
  the same figure.
- **Est. change (g)** `= (eaten − Est. burn) ÷ k`.
- **Estimate vs reality**:
  - the predicted change is `Σ(intake − TEF − formula BMR − active) ÷ k` over
    the counted days d with `first ≤ d < last` weigh-in, scaled by
    `span ÷ counted` when not every day counts
  - it is shown next to the weight trend's change; the gap is
    `trend change − scaled estimate`
  - the kcal/day it implies is the offset
- **Resting metabolism chart**: per day, BMR next to the calibrated baseline
  from the `L` days before that day. It shows the calibrated line whatever the
  basis setting. When the range ends today, its last point equals today's
  calibrated R.

## 9. Safety checks (shown, never enforced)

Only Rate and By date goals raise them. A here is the **steady lookback
mean**, not today's `A_d`: if that mean is missing, the checks use the mean
over counted window days, else today's figure. The floor is compared with the
goal at that steady A.

- **Loss**: ≤ 1% of trend weight and ≤ 1 kg per week. **Gain**: ≤ 0.5% of
  trend weight per week (needs a trend weight).
- **Deficit** `−rate × k`: ≤ 25% of total burn `(R + A) ÷ (1 − f)`, and ≤ 1,000 kcal.
- **Intake floor** (loss goals): goal ≥ `max(R, 1,500 if male, else 1,200)`.
  R is the calibrated baseline when it is applied.
- **Target**: weight ≥ BMI 18.5 (any rate or date goal with a target); no
  loss goal under 18.
- **Date** (By date only): flagged when passed (≤ 0 days), too soon (< 21 days)
  or too far (> 730 days).
- **Info flags**: the resting figure is the formula (not calibrated); no
  smoothed trend (only the latest reading is available).

**Fastest safe rate**, offered in the form:
- loss: the smallest of 1% a week, 1 kg a week, the 25% deficit, 1,000 kcal ÷ k
  and the floor; 0 under 18
- gain: 0.5% a week

## 10. Invariants

1. **One engine.** The dashboard and every MCP tool read the same goal
   (`applyDerivedGoals` inside `buildDashboardPayload`). The only exception
   is the §1 fallback.
2. **Burn is additive**: `resting + active + digestion`. No activity
   multiplier, no TDEE × factor.
3. **Active is counted once.** The baseline subtracts the same watch active
   the goal adds back. An unsynced day is unknown, never 0.
4. **Calibration reads formula rows only.** Nothing calibrated feeds back into it.
5. **The same `k`, `L` and `f` everywhere they appear.** Fixed mode is the one
   documented exception: its active is added 1:1, not divided by `(1 − f)`.
6. **One resting figure.** The Body tab baseline, Est. burn on every tab, the
   Resting metabolism chart's last point and the "How this is calculated"
   panel are one calculation and must agree.
7. **The What-if lab is a sandbox.** It never changes goals, balances or tool output.
8. **Safety checks advise.** Only impossible input is refused.

## Known deviations (code to fix, not rules to relax)

Found by the nutritionist review on 2026-11-21 against commit a7d8721.

1. **Body tab "Est. burn today" uses formula BMR**, not R
   (`buildWeightStats`, `src/dashboard-stats.ts`). The Body and Today tabs
   disagree when calibration is on. Breaks §8 and invariant 6.
2. **The Resting metabolism chart ignores the user's `L` and `k`.**
   `metabolismSeries` hard-codes `WINDOW_DAYS` and the default k
   (`src/calibration.ts`), and `buildDashboardPayload` passes it no model.
   Breaks §7 and invariant 6.
3. **Body details accepts k from 3 to 9** (`src/dashboard.ts`). Make it
   5–7.7, as in the What-if lab.
4. **Wording**:
   - the UI calls 7.7 "pure fat" (`public/dashboard.html`); it is adipose tissue
   - the `low_intake` flag says "your BMR" when the floor may be the
     calibrated R (`src/goal-plan.ts`)
   - stale comments say "28 days" (`src/dashboard.ts`)

## Where each formula lives

| Formula | Code |
| --- | --- |
| Goal, rate, f, A, trend weight, checks, macros | `src/goal-plan.ts`: `goalKcal`, `planRate`, `tefRatio`, `activeAverage`, `goalActiveKcal`, `trendWeightToday`, `goalFlags`, `recommendedRates`, `scaleDerivedMacros`, `applyDerivedGoals` |
| BMR, TEF, burn, balance, weight slope | `src/body.ts`: `bmrMifflin`, `bmrFor`, `foodTef`, `dailyBurn`, `balanceGrams`, `weightSlope` |
| Calibration | `src/calibration.ts`: `energyWindow`, `calibratedBaseline`, `buildCalibration`, `metabolismSeries` |
| Day counting, Body-tab stats, default goal | `src/dashboard-stats.ts`: `countDay`, `typicalDayKcal`, `buildWeightStats`, `withBurnDefault`, `buildEstimateVsScale` |
| Fixed goal + active | `src/activity.ts`: `adjustGoalsForActivity` |
| Watch merge | `src/health-merge.ts`: `mergeByDay`, `GarminMode` |
| Settings → model, k/L validation | `src/dashboard.ts`: `modelFromProfile`, `buildDashboardPayload` |
| MCP goal and fallback | `src/mcp.ts`: `effectiveGoals` |
