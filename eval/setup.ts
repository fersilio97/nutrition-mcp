/**
 * Creates the eval's test users in the LOCAL Supabase, each with the same
 * profile and the same copy of the real account's saved recipes, and clears
 * their meals. Re-running resets them.
 *
 *   bun eval/setup.ts eval/data/users.json eval/data/recipes.json
 *
 * users.json: { "<arm>": "<uuid>", ... }
 * recipes.json: rows for public.recipes (without id/user_id)
 */
import { SQL } from "bun";
const dbUrl =
    process.env.EVAL_DB_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):/.test(dbUrl))
    throw new Error("refusing a non-local database");
const db = new SQL(dbUrl);
const users: Record<string, string> = await Bun.file(process.argv[2]!).json();
const recipes: Record<string, unknown>[] = await Bun.file(
    process.argv[3]!,
).json();

for (const [arm, id] of Object.entries(users)) {
    await db`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
             values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                     ${`eval-${arm}@eval.localhost`}, now(), now())
             on conflict (id) do nothing`;
    await db`delete from public.meals where user_id = ${id}`;
    await db`delete from public.recipes where user_id = ${id}`;
    await db`insert into public.profiles (user_id, timezone, alcohol_tracking_enabled)
             values (${id}, 'America/Los_Angeles', true)
             on conflict (user_id) do update set timezone = excluded.timezone,
               alcohol_tracking_enabled = excluded.alcohol_tracking_enabled`;
    for (const r of recipes)
        await db`insert into public.recipes ${db({ ...r, user_id: id })}`;
    console.log(`${arm}: ${id} ready (${recipes.length} recipes)`);
}
process.exit(0);
