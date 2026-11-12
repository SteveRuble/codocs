import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests run against their own SQLite file so they never touch dev data.
    // (SQLite paths in Prisma 6 are relative to the schema file: this is prisma/test.db.)
    env: { DATABASE_URL: "file:./test.db" },
    globalSetup: ["./test/globalSetup.ts"],
    // One shared database file, so test files must not run at the same time.
    fileParallelism: false,
  },
});
