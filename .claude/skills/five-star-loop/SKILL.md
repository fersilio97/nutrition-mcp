---
name: five-star-loop
description: Harsh-reviewer UX audit loop for nutrition-mcp. Audit the live app, score it, file the feedback as vault ideas, build the batch the user picks, preview it on localhost, then re-audit, repeating until the app earns 5 stars. Use for "/five-star-loop", "audit the app again", "next iteration", or "how many stars are we at".
---

# Five-star loop

One run is one iteration: **audit → score → capture → pick → build → preview → stop for the user**. The next run starts with the next audit and compares it against the last one.

## 0. Load the baseline
- Read the latest note in `~/Github/personal-vault/01-Projects/nutrition-mcp/Audits/` (`YYYY-MM-DD - Audit N.md`) and the hub `000 - nutrition-mcp.md` for open items and their statuses.
- If no audit exists, this run is Audit 1.
- **Audit notes stay in the vault, never in this repo.** They quote the user's real intake and weight, and the repo is public.

## 1. Audit as an exigent user who always leaves bad reviews
Every con must cite evidence seen **in this run**, never memory or an earlier audit. Collect the evidence first:
- **Live account, read-only tools only:** `get_profile`, `get_goal_progress`, `get_trends`, `get_meal_patterns` and `get_nutrition_summary`. Never call a write tool on the live account.
- **Dashboard in Chrome** at 390 px and at desktop width, in light and dark mode. Use production `/dashboard`, or `bun run dashboard:preview` and its `?scenario=` values for unreleased work.
- **Widgets:** `bun run harness`.
- **Code** wherever a claim depends on it, e.g. "nothing nudges the user". Check each claim with a separate, word-bounded grep, and read the hits.
- **Competitors:** at most one search pass covering MyFitnessPal, Cronometer, MacroFactor, Lose It, Yazio and Lifesum. Prefer vendor pages, flag affiliate blogs as approximate, and cite the URLs.

Separate what is missing from what is in flight: unmerged branches (`git log origin/main..origin/<branch>`) and vault items marked `planned` or `in-progress` are not discoveries.

## 2. Score
Score each category 1–5 in steps of 0.5, with a one-line, evidence-based reason:

| Category | 5 means |
|---|---|
| Logging speed | Any entry takes one sentence or one tap; repeats take one word |
| Data trust & accuracy | Every surface agrees; each figure shows where it came from |
| Insight & coaching | It explains what changed and what to do, unprompted |
| Retention & habit loop | Missed days are rare, and the app brings the user back |
| Mobile access & onboarding | Installable, set up in one pass, no unset basics |
| Visual craft | Matches https://nutrition.labucu.com (`public/styles.css`) at every width and in both themes |

- **Stars** = the mean, rounded to the nearest whole star.
- **5 stars** requires all three:
  - every category ≥ 4.5;
  - no open bug notes in the vault;
  - you, as the reviewer, cannot name an evidence-backed con worth a p0 or p1.

  Below that, the loop goes on.
- Show each score's change from the previous audit.

## 3. Diff against the last audit
- Mark each previous con as **fixed**, **still open** or **regressed**, citing this run's evidence.
- A con that already has a vault note is updated in that note, never refiled.
- A `wont-do` item is reopened only on new evidence, and you must say what that evidence is.

## 4. Capture
- File every new feature, bug and skip verdict with the vault's `capture-idea` skill (`~/Github/personal-vault/.claude/skills/capture-idea/SKILL.md`): one note each, in English, with IDs from max+1. Tag notes `ux-audit` and link the audit note.
- Status vocabulary: features go `idea → planned → in-progress → done`; bugs go `suspected → confirmed → … → fixed`. Skips get `wont-do`, with the reason under `## Why`.
- Write the audit note (stars, scorecard, pros, cons linked to their notes, market verdicts, the batch) and link it from the hub's `## Notes`.
- Commit exact paths only, then push. If the push is rejected, run the overlap check from `capture-idea` before pulling.
- Never send vault content to Codex.

## 5. Pick the batch with the user
- Use `AskUserQuestion` in multi-select mode with at most four options. Rank them by expected star gain per unit of effort and put the recommendation first. The user can add their own items through "Other".
- Mark the chosen notes `in-progress`.

## 6. Build
- Work in a worktree branched from current `origin/main`, or from a base the user names. Run `bun run gen:all` first: a fresh checkout has no generated pages, and about 20 tests fail without them. Then get a green `bun test` before you start.
- Follow the project CLAUDE.md, especially:
  - the tool-count sweep across every locale file and all five generators;
  - additive migrations that you write but **do not apply**;
  - `outputSchema` on every path;
  - widget strings in every locale.
- Delegate under the global CLAUDE.md rules: mechanical work and locale files go to `codex exec -s workspace-write`, which must not commit. Review every delegated diff.
- Before calling the build done: `bun test`, `bun run typecheck` and `bun run format:check` pass, and new behaviour has tests.

## 7. Preview on localhost
- Add a `?scenario=` to `scripts/dashboard-preview.ts` and `src/dashboard-fixture.ts` for each change, and add harness samples for widget changes.
- Screenshot each scenario in Chrome at 390 px and at desktop width, and compare it with the benchmark site.
- Give the user the exact URLs, e.g. `http://localhost:8791/dashboard?scenario=water-on`, and say what to look at on each.

## 8. Stop for the user
- Commit, push the branch, and open a **draft** PR with `--repo fersilio97/nutrition-mcp`, because bare `gh` targets upstream.
- The PR body lists any migration with the instruction "run `supabase db push` before merging".
- **Never merge, and never apply migrations.** Merging `main` deploys to production.
- Set the batch's vault notes to `ready-for-review` and add the PR link.
- The next iteration starts when the user says the batch is merged or says "next iteration".

## 9. Report
End with:
- the stars and scorecard, old → new;
- what was built and where (branch, PR, preview URLs);
- the open items, the recommended next batch, and which engine did which part;
- a final `result:` line.
