/**
 * One A/B arm as a stdio MCP server, for `claude -p --mcp-config`.
 *
 *   bun eval/stdio-server.ts --root <checkout> --user <uuid>
 *
 * Loads `registerTools` and SERVER_INSTRUCTIONS from the checkout given by
 * --root (main or the branch), so both arms run their own code against the
 * same local database. The caller's env must point SUPABASE_URL /
 * SUPABASE_SECRET_KEY at a LOCAL Supabase; this refuses anything else.
 */
const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
};
const root = arg("root");
const user = arg("user");
if (!root || !user) throw new Error("usage: --root <checkout> --user <uuid>");
const url = process.env.SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))
    throw new Error(`refusing a non-local SUPABASE_URL (${url})`);

const { McpServer } = await import(
    Bun.resolveSync("@modelcontextprotocol/server", root)
);
const { StdioServerTransport } = await import(
    Bun.resolveSync("@modelcontextprotocol/server/stdio", root)
);
const { registerTools, SERVER_INSTRUCTIONS } = await import(
    `${root}/src/mcp.ts`
);
const server = new McpServer(
    { name: "nutrition", version: "eval" },
    {
        capabilities: { tools: { listChanged: false } },
        instructions: SERVER_INSTRUCTIONS,
    },
);
// Widgets off (a terminal client), alcohol shown in US drinks: the same for
// both arms, so neither setting can explain a difference.
registerTools(server, user, false, "us", "modern", "http://localhost");
await server.connect(new StdioServerTransport());
