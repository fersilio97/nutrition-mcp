/**
 * Diff report for a replay: per case, the original log (claude.ai, main as it
 * was then), arm A twice (main now, for the noise baseline) and arm B (the
 * branch), with a first-pass cause for every difference.
 *
 *   bun eval/report.ts eval/data/cases.jsonl eval/data/results.jsonl > eval/data/report.md
 */
const [casesPath, resultsPath] = process.argv.slice(2);
const lines = async (p: string) =>
    (await Bun.file(p).text())
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
const cases = await lines(casesPath!);
const results = await lines(resultsPath!);

type Meal = {
    calories: unknown;
    protein_g: unknown;
    items: any[] | null;
    description: string;
};
const total = (meals: Meal[], key: "calories" | "protein_g") =>
    meals.reduce((s, m) => s + Number(m[key] ?? 0), 0);
const loomUsed = (meals: Meal[]) =>
    meals.flatMap((m) => m.items ?? []).filter((i) => i.recipe_id || i.food_id);

const rows: string[] = [];
let sumAbsAB = 0,
    n = 0;
for (const c of cases) {
    const by = (arm: string) =>
        results.find((r) => r.case === c.id && r.arm === arm);
    const [a1, a2, b] = [by("A1"), by("A2"), by("B")];
    if (!a1 || !a2 || !b) continue;
    const k = (r: any) => Math.round(total(r.meals, "calories"));
    const p = (r: any) => Math.round(total(r.meals, "protein_g"));
    const noise = Math.abs(k(a1) - k(a2));
    const aMean = (k(a1) + k(a2)) / 2;
    const d = Math.round(k(b) - aMean);
    const used = loomUsed(b.meals);
    let cause: string;
    if (!b.meals.length || !a1.meals.length || !a2.meals.length)
        cause = "**nothing logged by an arm — check the reply**";
    else if (used.length)
        cause = `Loom used: ${used.map((i: any) => `${i.name} (${i.amount} ${i.unit}${i.children?.length ? `, ${i.children.length} ingredients` : ""})`).join("; ")}`;
    else if (Math.abs(d) <= Math.max(noise, 0.1 * aMean))
        cause = "same as main within noise";
    else cause = "**differs without Loom — review**";
    sumAbsAB += Math.abs(d);
    n++;
    rows.push(
        `| ${c.id} | ${c.tag} | ${c.prompt.replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 70)} | ${c.original_kcal} | ${k(a1)} / ${k(a2)} | ${k(b)} | ${d > 0 ? "+" : ""}${d} | ±${noise} | P ${p(a1)}/${p(a2)} → ${p(b)} | ${cause} |`,
    );
}
console.log(`# Replay: main vs loom-food (${n} cases)\n`);
console.log(
    "kcal per case. A = main now (two runs: their gap is the noise), B = the branch with Loom. Original = what was logged in claude.ai at the time.\n",
);
console.log(
    "| case | tag | prompt | original | A1 / A2 | B | B − A | noise | protein | cause |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));
console.log(`\nMean |B − A|: ${Math.round(sumAbsAB / Math.max(n, 1))} kcal.`);
const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
console.log(
    `Replay cost (plan usage, API-equivalent): $${cost.toFixed(2)} over ${results.length} runs.`,
);
