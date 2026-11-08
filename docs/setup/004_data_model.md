# 004 – Data model

**Outcome:** the real schema (`User`, `Document`, `Comment`), the first migration applied to `dev.db`, a seed script, and a verified picture of how Prisma behaves for the queries we'll write in steps 007–009. No new HTTP routes yet.

**Written for:** you, a Go developer who knows SQL and has used migration tools like goose, golang-migrate, or sqlc's schema files.

## Run it

```powershell
cd api
npm run db:migrate     # applies prisma/migrations/* to dev.db (already applied if you pulled my state)
npm run db:generate    # regenerate the typed client after ANY schema change
npm run db:seed        # idempotent sample data
npm run db:studio      # browser UI over the data
```

## The model

```
User 1───* Document 1───* Comment *───1 User
 (owner)                              (author)
```

All three live in [api/prisma/schema.prisma](../../api/prisma/schema.prisma).

| Model | Notes |
|-------|-------|
| `User` | Identity is `githubId` (unique), not `login`, because GitHub usernames can change. Created lazily on first authenticated request (step 006). |
| `Document` | `content` is stored in the row. `lineCount` is **denormalised**: computed once at upload, because the list endpoint shows it for every row and recomputing means loading every document's full text. |
| `Comment` | Anchored to an inclusive, 1-indexed `startLine`..`endLine`; one line means start == end. |

### Decisions worth defending in an interview

**IDs: `@default(cuid(2))`.** App-generated opaque strings, not auto-increment integers: safe to expose in URLs (no enumeration, no row-count leak), and can be generated before the insert. Contrast with Go's usual `bigserial` or `uuid`. `cuid(2)` is the current cuid version (plain `cuid()` is v1). UUIDv7 is the other reasonable choice, since it's time-sortable and a native Postgres type.

**Naming: PascalCase models, snake_case tables.** `model Document { ownerId … @map("owner_id") @@map("documents") }`. Your TypeScript sees `prisma.document` and `ownerId`; your SQL, DBAs and other tools see `documents.owner_id`. Without `@map`, tables would be named `Document` and columns `ownerId`, which is legal but non-idiomatic SQL.

**Timestamps.** `createdAt @default(now())` is set by the database. `updatedAt @updatedAt` is set by **Prisma's client**, not a DB trigger, so raw SQL updates won't touch it. (The migration shows `updated_at DATETIME NOT NULL` with no default for exactly this reason.)

**Referential actions: be explicit about what a delete does.**

| Relation | `onDelete` | Why |
|----------|-----------|-----|
| `Document.owner → User` | `Restrict` | Can't delete a user who owns documents. |
| `Comment.document → Document` | `Cascade` | Comments are meaningless without their document. |
| `Comment.author → User` | `Restrict` | Don't silently erase other people's comments. |

Verified by running it: deleting a user who owns documents fails; deleting a document removes its comments (1 comment before, 0 after).

**Indexes.** Primary keys and `@unique` get indexes automatically; **foreign keys do not** (true in SQLite and Postgres; MySQL's InnoDB does index them). We index by the queries we know we'll run:
- `Document(createdAt)`: list newest first. `Document(ownerId)`: "my documents".
- `Comment(documentId, startLine)`: "comments for this document in line order" in one index scan. The leading column also serves plain `documentId` lookups, so no separate index on it.
- `Comment(authorId)`: FK index.

**No enums (yet).** There's nothing in this domain with a closed set of states. Prisma supports `enum` (including on SQLite) when we need one; don't add them speculatively.

**Types.** `Int` is a 32-bit integer and comes back as a JS `number`. `DateTime` comes back as a JS `Date`. Both checked below.

## Migrations

```
api/prisma/migrations/
  migration_lock.toml                       pins the provider; commit it
  20261108184345_init/migration.sql         plain SQL; commit it
```

**How `migrate dev` works:** Prisma compares `schema.prisma` against the migration history (replayed in a throwaway **shadow database**), generates the SQL for the difference, saves it as a new timestamped folder, and applies it. It tracks what's applied in a `_prisma_migrations` table. Compare golang-migrate/goose: you author SQL by hand; here the SQL is *derived* from the schema, but still lands as reviewable files.

**What I did, in order**
1. Wrote the schema. `npx prisma validate` and `npx prisma format` check and tidy it.
2. `npx prisma migrate dev --name init --create-only`: generates the SQL **without applying it**, so it can be reviewed and edited.
3. **Edited the SQL** to add two `CHECK` constraints Prisma's schema language can't express:
   ```sql
   CONSTRAINT "comments_line_range_check" CHECK ("start_line" >= 1 AND "end_line" >= "start_line"),
   CONSTRAINT "documents_line_count_check" CHECK ("line_count" >= 0),
   ```
4. `npx prisma migrate dev`: applied it.
5. **`npx prisma generate`: regenerate the client.** I forgot this at first and the seed script failed with `Property 'user' does not exist`. In Prisma 7, **`migrate dev` no longer runs `generate` for you**, so the client is stale until you do. `npm run db:generate` is now a script for this.

**Rules for migrations**
- **Never edit a migration after it has been applied anywhere shared.** Prisma stores a checksum; editing an applied file causes drift errors. Edit only freshly created (`--create-only`) ones. Fix mistakes with a *new* migration.
- `migrate dev` is for development only (it can prompt to reset the database). In CI/production you run **`prisma migrate deploy`**, which only applies pending migrations and never generates or resets.
- `db push` skips migration files entirely. Useful for throwaway prototyping; not for anything you'll deploy.
- `migrate reset` drops the database, replays everything, and runs the seed. Handy locally.

**SQLite caveat for the hand-added `CHECK`s.** SQLite can't alter a table's constraints in place. When a later change needs it, Prisma *rebuilds* the table, generating a fresh `CREATE TABLE` from the schema, which would **silently drop** hand-written `CHECK`s unless copied into that migration (there's a comment in the SQL saying so). On Postgres, `ALTER TABLE … ADD CONSTRAINT` persists and the problem doesn't exist. The pattern of "create-only, then hand-edit the SQL" is how you get anything Prisma can't model (CHECKs, partial indexes, triggers, extensions) into the database.

## The seed

[api/prisma/seed.ts](../../api/prisma/seed.ts), wired via `migrations.seed` in `prisma.config.ts`. It uses `upsert` with stable keys so running it repeatedly is safe (I ran it twice). Note the shutdown: `.finally(() => prisma.$disconnect())`. A script that never disconnects will hang forever on the open connection.

It reuses `loadConfig` and `createPrismaClient` from `src/`: the same factories, no copy of connection logic.

### Build config split
Because `seed.ts` and `prisma.config.ts` sit outside `src/`:
- `tsconfig.json` covers everything we write and has `noEmit`. It's what your editor and `npm run typecheck` use.
- `tsconfig.build.json` extends it, narrows to `src/`, and emits to `dist/`. `npm run build` is now `tsc -p tsconfig.build.json`.

Without the split you would either leave the seed untypechecked or have `rootDir` change and emit `dist/src/server.js` instead of `dist/server.js`. Verified: `dist/server.js` exists and `dist/` has no seed.

## What the queries look like (all run against the seeded DB)

**List shape** (`GET /api/documents` in step 007): `select` picks columns; `_count` computes comment counts in the query:
```ts
prisma.document.findMany({
  orderBy: { createdAt: "desc" },
  select: {
    id: true, title: true, lineCount: true, createdAt: true,
    owner: { select: { login: true } },
    _count: { select: { comments: true } },
  },
});
// → [{ id, title, lineCount: 7, createdAt: Date, owner: { login: "ada" }, _count: { comments: 2 } }]
```
`select` vs `include`: `select` is an allowlist (you get only what you name, **including nested relations**); `include` adds relations on top of *all* scalar fields. Prefer `select` for API responses so adding a column later can't leak into a response by accident. For lists, never fetch `content`.

**One document with ordered comments** (steps 008/009):
```ts
prisma.document.findUnique({
  where: { id },
  select: { title: true, comments: { orderBy: [{ startLine: "asc" }, { createdAt: "asc" }], select: { … author: { select: { login: true } } } } },
});
```
The `ORDER BY` has a deterministic tiebreaker (`createdAt`) so comments on the same line don't shuffle between requests.

**Not found, three ways**

| Call | Missing row |
|------|-------------|
| `findUnique` | returns `null` |
| `findUniqueOrThrow` | throws `P2025` |
| `update` / `delete` | throws `P2025` |

Choose deliberately: use `findUnique` + an explicit 404 in the service for "might not exist" (which is the normal API case); lean on `P2025` where the absence is truly exceptional.

**Atomic nested writes.** One call can create a document *and* its comments, all-or-nothing:
```ts
prisma.document.create({ data: { …, ownerId, comments: { create: [{ … }] } } });
```

**Interactive transactions.** `prisma.$transaction(async (tx) => { … })` runs every statement in one transaction; if the callback throws, everything rolls back. Verified: a duplicate insert on the second step rolled back the first (`null` afterwards). Always use `tx`, not `prisma`, inside the callback, or the statement runs *outside* the transaction.

## Errors you will handle in step 005

Prisma throws `Prisma.PrismaClientKnownRequestError` with a `code`. What I actually observed:

| Situation | `code` | Becomes (HTTP) |
|-----------|--------|----------------|
| `findUniqueOrThrow` / `update` / `delete` on a missing row | `P2025` | 404 |
| duplicate on a `@unique` column | `P2002` | 409 |
| bad FK (owner doesn't exist) **or** restricted delete | `P2003` | 409 / 422 |
| `CHECK` constraint violation | `P2039` | 422 (but validate first) |

**Gotchas I saw:**
- With driver adapters (Prisma 7), `meta.target` for `P2002` is **not** populated the way old tutorials show. The failed column is at `meta.driverAdapterError.cause.constraint.fields`. Prefer not to depend on `meta` at all: check expected conditions in code, and treat these errors as a safety net.
- `P2039` for a CHECK failure is a catch-all for a driver error, not a purpose-built code. That's one more reason the service validates the line range (step 009) before touching the database; the constraint exists as the backstop, not the user-facing validation.
- Import the error class from the **generated** client (`import { Prisma } from "../generated/prisma/client.js"`) for `instanceof` checks, not from `@prisma/client`.

## Go contrast

| Go | Prisma |
|----|--------|
| `.sql` migration files you write; `goose up` | `.sql` migration files **generated** from the schema; `migrate dev` / `migrate deploy` |
| sqlc: SQL in, Go types out | schema in, client + types out. No SQL for CRUD; `$queryRaw` when you need it |
| `sql.ErrNoRows` | `findUnique` → `null`; `*OrThrow` → `P2025` |
| `errors.As(err, &pgErr); pgErr.Code == "23505"` | `err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"` |
| `tx, _ := db.BeginTx(ctx, nil); defer tx.Rollback()` | `prisma.$transaction(async (tx) => …)`; rollback on throw is automatic |
| manually writing `JOIN`s and scanning | `select`/`include` with nested relations; Prisma issues the queries and assembles the objects |
| `NULL` via `sql.NullString` | `String?` → `string \| null` in TS |

## How I verified it

- `prisma validate`: valid. `migrate dev`: applied; `migrate status`: up to date.
- `npm run typecheck`, `npm run build`: clean. `npm run db:seed` run twice: idempotent.
- A throwaway script (since deleted) confirmed every behaviour in the tables above, including both `CHECK` violations being rejected by the database, FK/unique/restrict failures, cascade delete, and transaction rollback.
- **Not verified:** the migration on a *fresh* database from scratch (`migrate reset` would do it, but it wipes your dev data, so I didn't run it). `migrate dev` did replay the migration in its shadow database, which covers most of that risk.

## Check your understanding

1. Why index `Comment(documentId, startLine)` rather than two single-column indexes?
2. Why is `lineCount` stored, and what invariant does that create that you must maintain?
3. What happens if you run `prisma migrate dev` after changing the schema and then start the app without `prisma generate`?
4. Why `--create-only` for the init migration? What would break if you edited it after it was applied in production?
5. `select` vs `include`: which would you use for an API response, and why?
6. Why does a Postgres deployment not have the "CHECK constraint disappears" problem, and what does SQLite do differently?
7. Inside `$transaction(async (tx) => …)`, what goes wrong if you call `prisma.user.create` instead of `tx.user.create`?

## Commit when ready

```powershell
git add api docs
git commit -m "Add data model, init migration, and seed script" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Note that `api/prisma/migrations/` must be committed (it's the source of truth for the database's history). `dev.db` is git-ignored.

Then say "next" and I'll do **005: Request validation and error handling**: Zod at the boundary, a typed `HttpError`, and mapping the Prisma errors above to proper HTTP responses.
