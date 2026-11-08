# 002 – Prisma setup

**Outcome:** Prisma 7 is wired into the API against a SQLite file. `GET /health/db` runs a real query. No models yet (step 003).

**Written for:** you, a Go developer who knows `database/sql` and has probably used sqlc or GORM. Basics are skipped.

## Run it

```powershell
cd api
npm install                 # postinstall now runs `prisma generate` for you
copy .env.example .env      # DATABASE_URL="file:./dev.db"
npm run dev
curl http://localhost:4000/health/db    # {"status":"ok","database":"reachable"}
```

## Prisma 7 in one paragraph

Prisma is three things. The **schema** (`prisma/schema.prisma`) is a declarative model file. The **CLI** (`prisma`) reads it to generate a client and to diff it into migrations. The **client** (`@prisma/client`) is the typed query API your app imports. The big change in 7 is that the database connection now goes through a **driver adapter**, a normal npm package (`@prisma/adapter-better-sqlite3`) that talks to the database driver. Prisma no longer manages its own connection. Most tutorials you find online, and many LLM answers, still show the 5.x/6.x setup, so expect to see both styles.

## Go contrast

| Go | Prisma / Node |
|----|---------------|
| `database/sql` + a driver import (`_ "github.com/mattn/go-sqlite3"`) | `@prisma/adapter-better-sqlite3` wraps `better-sqlite3` and is passed to the client |
| `sql.Open(...)`, a `*sql.DB` pool shared across goroutines | `new PrismaClient({ adapter })`, one per process |
| sqlc: write SQL, generate typed Go | Prisma: write a schema, generate a typed client. You can drop to raw SQL with `$queryRaw` |
| GORM struct tags + `AutoMigrate` | `schema.prisma` is the source of truth, and `prisma migrate dev` writes **reviewable SQL files** in `prisma/migrations/` |
| `go generate` produces code you commit | `prisma generate` produces code we **gitignore** (`src/generated/`). It's rebuilt by `postinstall`. |
| `context.Context` on every query | not needed. Queries are `Promise`s; cancellation is less of a concern. |

**Key difference:** Go's `database/sql` returns rows you scan into types yourself. Prisma returns plain JS objects already typed from the schema, with no scanning. You get that typing for free, but nothing enforces it at runtime, just as with the JSON decoding in step 001.

## What I did, file by file

### `api/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db {
  provider = "sqlite"
}
```
- **`generator`**: `prisma-client` is the newer generator. It writes **TypeScript source** into `src/generated/prisma` that your project compiles, instead of a hidden copy inside `node_modules`. You can read and debug the client. Old tutorials use `provider = "prisma-client-js"`, which no longer matches the setup.
- **`datasource`**: no `url` anymore. Prisma 7 moved connection config out of the schema.

### `api/prisma.config.ts`
Read only by the **CLI** (`migrate`, `generate`, `studio`). It is not loaded by your app.
- **Don't rely on the CLI loading `.env` for you.** This file calls `import "dotenv/config"` explicitly before reading `DATABASE_URL`, so the CLI sees the same value as the app. Your app loads `.env` a different way (Node's built-in `--env-file`), which is why there are two mechanisms. Many people get bitten by "works in dev, `DATABASE_URL` undefined in the CLI."
- `defineConfig` is typed, so a wrong key is a compile error.

### `api/src/db.ts`
```ts
const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });
export const prisma = new PrismaClient({ adapter });
```
- The adapter is constructed from the **same URL** the CLI uses. It's a second, separate place the path is set. If you change one, change the other.
- `PrismaClient` owns a connection pool. Creating one per request leaks connections, just as opening `sql.Open` per request would. A module-level singleton is the standard pattern. Note that **module-level code runs once** because ES modules are cached, which is the same idea as a package-level `var db`.
- The import path `./generated/prisma/client.js` uses the `.js` extension from step 001. The generated file is ESM.

### `api/src/app.ts` — the new route
```ts
app.get("/health/db", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ ok: bigint }[]>`SELECT 1 AS ok`;
  res.json({ status: "ok", database: rows[0]?.ok === 1n ? "reachable" : "unexpected" });
});
```
- **Tagged template literals** (`` $queryRaw`...` ``) are the safe way to run raw SQL. The `${}` placeholders become **bound parameters**, not string concatenation. This prevents SQL injection, just like `db.Query(sql, args...)` in Go. Never build SQL with `+` or template interpolation outside the tag.
- **BigInt gotcha:** the probe showed `rows[0].ok` is the `bigint` `1n`, not the number `1`. SQLite integers are 64-bit and JS numbers only hold 53 bits, so raw queries return `bigint`. Typed model queries in step 003 convert to `number`. Also, `JSON.stringify` **throws** on a `bigint`, so you can't `res.json()` a raw row directly. We return a string for that reason.
- `$queryRaw` is also an `async` call, so the handler is `async`. Express 5 forwards a rejected promise to the error handler from step 001, so a DB failure returns the JSON 500.

### `.env` and `.gitignore`
- `DATABASE_URL="file:./dev.db"` is relative to the **current working directory**, which is why every command runs from `api/`.
- Ignored: `src/generated/` (rebuilt by `postinstall`) and `*.db` (local data).

### `package.json`
- `prisma` moved to **devDependencies**. The CLI is a build-time tool. The runtime only needs `@prisma/client` and the adapter.
- `postinstall: prisma generate` means a fresh clone runs `npm install` and gets a working client. Without it, `tsc` fails with "cannot find module ./generated/prisma/client".
- `db:migrate` and `db:studio` are shortcuts. `db:studio` opens a browser UI on your data, which is handy for checking your work.

## Verified

- `npm run typecheck`: clean.
- `npm run build`: clean, and the generated client is compiled into `dist/`.
- `npx prisma generate`: client written to `src/generated/prisma`.
- `dev.db` created, and `GET /health/db` returns `reachable` (after fixing the BigInt comparison).
- `prisma migrate dev` ran but created **no migration**. That's expected: the schema has no models yet. Step 003 adds the first one, and that's where you'll see migration files.

## Things that will probably come up in the screen

- **Migrations vs `db push`:** `migrate dev` makes versioned SQL files you commit, which is what you want in a team. `db push` syncs the schema with no history and is for prototypes. Say you'd use `migrate deploy` in production.
- **Client regeneration:** change `schema.prisma` and the types are stale until `prisma generate` runs. `migrate dev` does it for you.
- **`null` vs `undefined`:** Prisma uses `null` for an empty column. An optional field you omit on create is `undefined`. This matters for updates: `undefined` means "don't touch it," and `null` means "set it to NULL."

## Check your understanding

1. Why does the datasource URL appear in two places, and what happens if they disagree?
2. Why is `prisma` in devDependencies but `@prisma/client` in dependencies?
3. Why does `$queryRaw` need the `` ` `` tagged-template form instead of a normal string, and what does that prevent?
4. Why is the route returning `1n` for a value you wrote as `1`?
5. Why is it a problem to create `new PrismaClient()` inside a request handler?

## Commit when ready

```powershell
git add api docs
git commit -m "Add Prisma 7 with SQLite and a database health check" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

Then say "next" and I'll do **003: Data model**: models, relations, indexes, and the first real migration.
