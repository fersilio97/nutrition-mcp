#!/bin/zsh
# Launcher for the local-only nutrition MCP server.
#
# launchd execs this rather than the bun binary directly: invoking bun straight
# from the plist left the job sitting at runs = 0, and a wrapper is also
# something you can run by hand to see the same failure launchd would hit.
#
# exec matters -- it replaces this shell with bun, so launchd supervises the
# server itself and KeepAlive sees the real process exit rather than the
# wrapper's.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:$PATH"
exec bun --smol src/index.ts
