import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const tempSchemaPath = path.join(appRoot, "tmp/schema.integration.sqlite.prisma");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function main() {
  writeSqliteSchema();

  let exitCode = 0;
  try {
    run("prisma", ["generate", "--schema", tempSchemaPath], {
      DATABASE_URL: "file:./test.db",
    });
    exitCode = run("vitest", ["run", "-c", "vitest.integration.config.ts"], {
      DATABASE_URL: "file:./test.db",
      PRISMA_SCHEMA_PATH: tempSchemaPath,
    });
  } finally {
    run("prisma", ["generate", "--schema", "prisma/schema.prisma"], {});
  }

  process.exit(exitCode);
}

function writeSqliteSchema() {
  const source = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8");
  const sqliteSchema = source
    .replace('provider  = "postgresql"', 'provider = "sqlite"')
    .replace(/\n\s*directUrl = env\("DIRECT_URL"\)/, "");

  mkdirSync(path.dirname(tempSchemaPath), { recursive: true });
  writeFileSync(tempSchemaPath, sqliteSchema);
}

function run(command: string, args: string[], env: Record<string, string | undefined>) {
  const result = spawnSync(npx, [command, ...args], {
    cwd: appRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

main();
