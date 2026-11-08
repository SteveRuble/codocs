// Read by the Prisma CLI (migrate, generate, studio). It is NOT loaded by the app at runtime.
// The CLI doesn't load .env for us here, so we do it explicitly; the app gets its env a
// different way (Node's --env-file in the npm scripts).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// This file is evaluated for every CLI command, but `prisma generate` never connects to a
// database. It runs in `postinstall`, where a fresh clone or CI has no .env yet, so for
// that one command a missing URL is tolerated. Every other command (migrate, studio, ...)
// still fails loudly when DATABASE_URL is unset; we never want a silent fallback to some
// default database file when migrating.
const isGenerate = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Run by `prisma db seed` and after `prisma migrate reset`.
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    url: isGenerate ? (process.env.DATABASE_URL ?? "file:./unused.db") : env("DATABASE_URL"),
  },
});
