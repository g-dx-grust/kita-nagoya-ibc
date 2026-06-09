import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const TEST_DB_URL = "file:./test.db";
const TEST_DB_ABS_PATH = path.resolve(__dirname, "..", "prisma", "test.db");

export default async function setup() {
  const appRoot = path.resolve(__dirname, "..");
  const journalPath = `${TEST_DB_ABS_PATH}-journal`;
  const schemaPath = process.env.PRISMA_SCHEMA_PATH ?? "prisma/schema.prisma";
  if (existsSync(TEST_DB_ABS_PATH)) unlinkSync(TEST_DB_ABS_PATH);
  if (existsSync(journalPath)) unlinkSync(journalPath);

  // The migration history only contains ALTER statements because the original
  // schema was bootstrapped via db push. Build the ephemeral test DB from the
  // current schema directly, without relying on migrate deploy or dev.db.
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL };
  const createSql = execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel ${schemaPath} --script`,
    {
      cwd: appRoot,
      env,
      encoding: "utf8",
    },
  );
  execSync(`npx prisma db execute --stdin --schema ${schemaPath}`, {
    cwd: appRoot,
    env,
    input: createSql,
    stdio: ["pipe", "inherit", "inherit"],
  });

  process.env.DATABASE_URL = TEST_DB_URL;
}
