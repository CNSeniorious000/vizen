#!/usr/bin/env bun
// CLI — `vizen serve` / `vizen build` / `vizen watch`.
// Thin wrapper over the server module. Uses Bun's argv (no extra dep).

import { createDevServer, createBuildServer } from "../server/index.ts";

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [cmd, ...rest] = argv;
  const root = rest.find((a) => !a.startsWith("-")) ?? process.cwd();

  switch (cmd) {
    case "serve":
    case "dev": {
      const port = flag(rest, "--port") ? Number(flagValue(rest, "--port")) : 5183;
      const server = await createDevServer({ root, port });
      const addr = server.httpServer?.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      console.log(`vizen dev → http://localhost:${p}`);
      break;
    }
    case "build": {
      await createBuildServer({ root });
      console.log("vizen build → done");
      break;
    }
    default:
      console.error(`usage: vizen <serve|build> [root] [--port N]`);
      process.exit(1);
  }
}

function flag(args: string[], f: string): boolean {
  return args.includes(f);
}

function flagValue(args: string[], f: string): string | undefined {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
}

// Entry: `bun run src/cli/index.ts serve`
if (import.meta.main) {
  runCli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
