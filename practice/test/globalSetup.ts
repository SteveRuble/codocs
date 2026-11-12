import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// Runs once before all test files: create a fresh, empty test database from schema.prisma.
// If a test run dies with "table ... does not exist", this step is what to look at.
export default function setup() {
  // SQLite paths in Prisma 6 are relative to the schema file, i.e. prisma/test.db.
  for (const suffix of ["", "-journal"]) {
    const file = path.join(__dirname, "..", "prisma", `test.db${suffix}`);
    if (existsSync(file)) rmSync(file);
  }
  // Starting from no file means a plain `db push` is enough: nothing to reset.
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
