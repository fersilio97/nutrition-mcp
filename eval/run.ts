/**
 * Replays each case against each arm with `claude -p`, then reads back what
 * that arm stored. One user per arm keeps the arms apart in one database.
 *
 *   bun eval/run.ts eval/data/cases.jsonl eval/data/arms.json eval/data/results.jsonl
 *
 * arms.json: [{ "arm": "A1", "root": "<main checkout>", "user": "<uuid>", "loom": false }, …]
 * Env: SUPABASE_URL / SUPABASE_SECRET_KEY (local), and for Loom arms
 * LOOM_URL / LOOM_WORKSPACE / LOOM_TOKEN.
 */
import { SQL } from "bun";

const [casesPath, armsPath, outPath] = process.argv.slice(2);
const cases = (await Bun.file(casesPath!).text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
const arms: { arm: string; root: string; user: string; loom: boolean }[] =
    await Bun.file(armsPath!).json();
const db = new SQL("postgres://postgres:postgres@127.0.0.1:54322/postgres");
const here = import.meta.dir;
const done = new Set(
    (await Bun.file(outPath!).exists())
        ? (await Bun.file(outPath!).text())
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((l) => {
                  const r = JSON.parse(l);
                  return `${r.case}:${r.arm}`;
              })
        : [],
);

// The user is not there to answer: the replay has to end in a logged meal.
const SYSTEM = [
    "You are replaying a meal-logging message for an automated test. The user cannot answer questions.",
    "Do not ask anything: make the most reasonable assumption for anything unclear, log the meal with the nutrition tools, and state each assumption in one line.",
    "When a lookup offers several matches, choose the one that fits the message best and say which you chose.",
    "Ignore any calendar or diet plan the message mentions; you can't see it.",
].join(" ");

for (const c of cases) {
    for (const a of arms) {
        if (done.has(`${c.id}:${a.arm}`)) continue;
        const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
            LOOM_USER_IDS: a.loom ? a.user : "",
        };
        const config = {
            mcpServers: {
                nutrition: {
                    command: "bun",
                    args: [
                        `${here}/stdio-server.ts`,
                        "--root",
                        a.root,
                        "--user",
                        a.user,
                    ],
                    env,
                },
            },
        };
        const cfgPath = `${here}/data/mcp-${a.arm}.json`;
        await Bun.write(cfgPath, JSON.stringify(config));
        // Each case starts from an empty log for this arm's user, so the
        // meals read back afterwards are exactly what this run stored.
        await db`delete from public.meals where user_id = ${a.user}`;
        const t0 = performance.now();
        const proc = Bun.spawn(
            [
                "claude",
                "-p",
                c.prompt,
                "--model",
                "sonnet",
                "--mcp-config",
                cfgPath,
                "--strict-mcp-config",
                "--allowedTools",
                "mcp__nutrition__*",
                "--append-system-prompt",
                SYSTEM,
                "--output-format",
                "json",
                "--max-turns",
                "12",
            ],
            { stdout: "pipe", stderr: "pipe", env },
        );
        const timer = setTimeout(() => proc.kill(), 240_000);
        const out = await new Response(proc.stdout).text();
        clearTimeout(timer);
        await proc.exited;
        let reply = "",
            cost = null,
            turns = null;
        try {
            const j = JSON.parse(out);
            reply = j.result ?? "";
            cost = j.total_cost_usd ?? null;
            turns = j.num_turns ?? null;
        } catch {
            reply = out.slice(0, 2000);
        }
        const meals =
            await db`select description, meal_type, calories, protein_g, carbs_g, fat_g,
              fiber_g, sugar_g, alcohol_g, caffeine_mg, source, items
            from public.meals where user_id = ${a.user} order by logged_at`;
        const row = {
            case: c.id,
            arm: a.arm,
            seconds: Math.round((performance.now() - t0) / 1000),
            cost,
            turns,
            reply,
            meals,
        };
        const prev = (await Bun.file(outPath!).exists())
            ? await Bun.file(outPath!).text()
            : "";
        await Bun.write(outPath!, prev + JSON.stringify(row) + "\n");
        console.log(
            `${c.id} ${a.arm}: ${meals.length} meal(s), ${meals.reduce((s: number, m: any) => s + Number(m.calories ?? 0), 0)} kcal, ${row.seconds}s`,
        );
    }
}
process.exit(0);
