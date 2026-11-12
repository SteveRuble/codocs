# Interview prep 000: debugging toolkit

**Format you described:** a partially built backend (TypeScript, Node, Express, Prisma), on Replit; you debug issues and add features while thinking aloud. Docs and the web are allowed; **AI-generated code is not**. That rule applies to the interview itself (use this prep material now, not then).

**Written for:** you, a Go developer. Go-contrast notes are where they help.

> **Caveat on Replit.** I can't see your Replit workspace or the interview repo, so the Replit parts below come from general knowledge of the platform. Rehearse in a real Repl (see the end) and trust what you see there over this document.

## 0. Before the session

- Create the Replit account and **open a throwaway Repl now** to find the Shell, Console, Secrets and file tree, so none of that is new under pressure.
- **Check Replit's AI features** (assistant/agent/AI code completion) and turn off any *inline completion* if it can't be disabled per session, so you never accidentally accept generated code. Rule: if in doubt, don't.
- Be ready to share your screen and talk. A silent debugger is hard to evaluate; a narrating one is easy to help.

## 1. The first five minutes in an unfamiliar repo

Do this out loud, in order. It's what a senior engineer does and it's cheap:

| Look at | Why |
|---------|-----|
| `README` | run/test commands, what the exercise says |
| `package.json` → `scripts`, `dependencies` | **what versions?** (Express 4 or 5, Prisma 5/6/7, Jest or Vitest). Versions change behaviour. |
| `.replit` (and `replit.nix`) | what the **Run** button actually runs, and system packages |
| `prisma/schema.prisma` | the data model: this is the map of the whole app |
| `src/server.ts` → `src/app.ts` | entry point, **middleware order**, how routes mount |
| `src/routes/*`, `src/services/*` | HTTP layer vs business logic |
| `test/` | what behaviour the authors consider correct |
| Shell: `git status && git log --oneline -10` | what changed recently (a regression? use it) |

Then **run the tests before touching anything**: `npm test`. Whatever is red *before* you start is your to-do list; whatever is green is your safety net. Note the count (e.g. "29 pass, 3 fail") so you can tell later whether you made things better or worse.

## 2. Replit mechanics

- **Shell vs Console.** The *Run* button runs the command from `.replit` and streams output to the **Console**. The **Shell** is a normal terminal for everything else (`npm test`, `curl`, `npx prisma ...`). Use the Shell for almost everything; the output is easier to scroll and rerun.
- **Environment variables = "Secrets."** On Replit, env vars usually live in the **Secrets** tool rather than a `.env` file. `process.env.DATABASE_URL` undefined? Look in Secrets *and* for a `.env` file. Changing a secret needs a restart of the running process.
- **Calling your own API:** from the Shell use `curl -i localhost:PORT/path` (`-i` shows status and headers). The **Webview** shows the public URL; it only works if the server listens on the port Replit expects. A server hardcoded to `127.0.0.1` or a different port can run fine yet be unreachable from the preview.
- **Port already in use** (`EADDRINUSE`): a previous run is still alive. Press **Stop**, or find and kill it (`lsof -i :PORT` then `kill PID`). In Go you'd see the same `bind: address already in use`.
- **Native-module / OpenSSL trouble:** if Prisma fails to load its engine with a *libssl* error, that's the environment (system packages in `replit.nix`), not your code. Say so, check the config, and move on.
- **Persistence:** SQLite file in the repo is fine for the session. If the repo uses Postgres, the connection string is in Secrets.

## 3. Running tests

| Goal | Vitest | Jest |
|------|--------|------|
| everything | `npx vitest run` | `npx jest` |
| one file | `npx vitest run test/loans.test.ts` | `npx jest test/loans.test.ts` |
| one test by name | `npx vitest run -t "409s when"` | `npx jest -t "409s when"` |
| watch mode | `npx vitest` | `npx jest --watch` |
| verbose names | `--reporter=verbose` | `--verbose` |
| stop at first failure | `--bail=1` | `--bail` |
| force serial files | `--no-file-parallelism` | `--runInBand` |
| find a hang | (look at the timeout error) | `--detectOpenHandles` |

Tips that pay off:
- **Isolate.** Change `it(` to `it.only(` to run one test, and `it.skip(` to park one. Remove them before you finish.
- **Read the diff Vitest/Jest prints.** `expected [ 'B', 'A' ] to deeply equal [ 'A' ]`: "expected" is what the test wanted; "received/actual" is what your code did. Which side is wrong tells you which function to open.
- **Tests print `console.log`** from your code, so log liberally while investigating, then delete.
- **Tests can be wrong too.** If code and test disagree, decide which one matches the *requirement*, say it out loud, and ask the interviewer if unsure.
- A test that **times out** (5s default) almost always means a **response was never sent** or a promise never settled (see the hang pattern below).
- **Flaky = ordering/async.** Passes alone, fails in the suite → shared state or missing `await`. Passes sometimes → race, usually a missing `await`.

## 4. Reading a stack trace

```
AppError: Member not found
    at checkoutBook (src/services/loans.ts:11:25)      ← YOUR code: start here
    at async Object.<anonymous> (src/routes/loans.ts:21:18)
    at node_modules/express/lib/router/layer.js:95:5   ← library frames: skim
```
1. Read the **error type and message** first (`PrismaClientKnownRequestError`, `TypeError`, `AppError`). The message often names the problem outright.
2. Find the **first frame in your own code** (`src/...`, not `node_modules`) and open that line.
3. Frames below it show *who called it*; use them to see the request path.
4. **Async stacks** can be short (`at async ...`); the cause may be one `await` away.
5. For Prisma errors read the **code** (`P2002` etc.) *and* the `meta`/message: they name the field or column.

**Go contrast:** Go errors are values you wrap and print; a stack appears only if you add one or it panics. In Node, a thrown `Error` carries its stack automatically, so *the stack is the first thing to read*. Also: **an unhandled promise rejection kills a modern Node process** (like an unrecovered panic).

TS is compiled/transpiled, so line numbers can be off. `tsx` and Vitest map back to your `.ts` files; for plain `node dist/...` add `--enable-source-maps`.

## 5. Where logs come from

- **Your own:** `console.log(JSON.stringify(obj, null, 2))` beats `console.log(obj)` for nested data. Label them: `console.log("req.body:", req.body)`.
- **The error handler.** Many apps swallow errors into `500 Internal server error` while logging the real one server-side. **If the response says "Internal server error", the answer is in the server console, not in the response.** Look at the Console/Shell where the server runs.
- **Prisma query log.** The most useful single trick: `new PrismaClient({ log: ["query", "warn", "error"] })` prints every SQL statement with parameters. It answers "what did Prisma actually run?", "how many queries?" (N+1), and "why is this `where` missing?". (Older versions also honour `DEBUG="prisma:*"`.)
- **HTTP level:** `curl -i` for status + headers; `curl -v` for the full exchange. Send a body with `-H 'content-type: application/json' -d '{...}'` (forgetting the header is a classic false alarm).
- **A scratch script** is faster than the server for data questions: a file `scratch.ts` that imports `prisma`, runs one query, prints it; run with `npx tsx scratch.ts`.

## 6. Prisma: how to investigate

**Commands**

| Command | Use |
|---------|-----|
| `npx prisma validate` | is the schema syntactically valid? |
| `npx prisma generate` | rebuild the typed client **after any schema change** (stale client = missing properties / wrong types) |
| `npx prisma db push` | sync the DB to the schema, no migration files (prototyping; likely in a SQLite exercise) |
| `npx prisma migrate dev` / `migrate status` / `migrate deploy` | migration workflow (if the repo has a `migrations/` folder) |
| `npx prisma studio` | browse data in a browser UI (needs the port forwarded; may be awkward) |
| `npx prisma format` | tidy the schema |

**Error codes you'll actually meet**

| Code | Meaning | Typical cause |
|------|---------|---------------|
| `P2002` | unique constraint failed | duplicate email/ISBN; check `meta.target` (v6) |
| `P2003` | foreign key constraint failed | referencing a row that doesn't exist, or deleting a parent that's referenced |
| `P2025` | record to update/delete not found | `update`/`delete` on a missing id; `findUniqueOrThrow` |
| `P2021` / `P2022` | table / column does not exist | schema changed but the DB wasn't pushed/migrated |
| `P1001` / `P1003` | can't reach / find the database | wrong `DATABASE_URL`, missing file |
| `PrismaClientValidationError` | your *query* is malformed | wrong type (`id: "5"` where Int expected), unknown field, missing required field |

Note: `PrismaClientValidationError` is a bug in the code that builds the query; `PrismaClientKnownRequestError` is the database refusing a valid query.

**Prisma behaviours that become interview bugs**

- **`undefined` vs `null` in `where`.** `{ returnedAt: null }` means `IS NULL`. `{ returnedAt: undefined }` means *no filter at all*. A typo'd or missing variable silently returns every row.
- **`findUnique` only takes unique fields** and returns `null` when not found; `findFirst` returns the first match (and `findFirst({ where: { id: undefined } })` happily returns *some* row). `findUniqueOrThrow` throws `P2025`.
- **`include` vs `select`:** `include` adds relations to all scalars; `select` is an allowlist. Mixing both at the same level is an error.
- **Always `await`.** A Prisma call is lazy: it returns a thenable and may not *run* until awaited. A forgotten `await` gives you a promise object in your response (`{}`) or a write that happens late, or never.
- **Inside `$transaction(async (tx) => ...)` use `tx`, never `prisma`.** Using `prisma` runs outside the transaction (not rolled back) and can deadlock waiting for the connection the transaction holds.
- **N+1:** a `for` loop (or `.map`) that does `await prisma...` per item. Fix with `include`, `in: [...]`, or one grouped query. Spot it with the query log.
- **Case-insensitive search:** SQLite's `contains` is case-insensitive for ASCII; **Postgres needs `mode: "insensitive"`**. A test that passes on SQLite can fail on Postgres.
- **Pagination:** `skip = (page - 1) * pageSize`, and a **stable `orderBy` with a unique tiebreaker** (`id`), or rows repeat/vanish across pages.
- **Counts/`_count`** and `count({ where })` must use the same `where` as the list.
- **Dates:** stored/returned as UTC `Date`. Comparing a `Date` to a string, or `lt` vs `lte` at a boundary, is a classic off-by-one.
- **Numbers from the network are strings:** `req.params.id`, `req.query.page`. `Number("")` is `0`; `parseInt("12abc")` is `12`; check `Number.isInteger`.

## 7. Express: where mistakes hide

| Symptom | Look at |
|---------|---------|
| `req.body` is `undefined` / every POST gets 400 "x is required" | `express.json()` **missing or registered after the routes**; or the client didn't send `Content-Type: application/json` |
| Request **hangs**, then client/test timeout | a response is never sent: an `async` route in **Express 4** with no try/catch or wrapper (rejection never reaches the error handler); a missing `return` after an early `res.json`; a handler that never calls `res`/`next` |
| `Cannot set headers after they are sent` | responded twice: missing `return` after `res.status(...).json(...)` in an `if` |
| Route matches the wrong handler | **registration order**: `/books/:id` before `/books/search` captures "search" as an id |
| 404 for a route that exists | mount prefix (`app.use("/api", router)` then the router's own paths), trailing slash, HTTP method |
| Correct data, wrong status | `res.json()` defaults to 200: need `res.status(201)`, etc. |
| 500 with no detail | read the **server-side** log; check the error handler, and whether `err` is an `AppError` or something unexpected |
| Works in curl, fails in the browser | CORS: `cors()` missing or wrong origin; preflight `OPTIONS` blocked by auth |

**Express 4 vs 5, since the interview repo may be either:** in 5, rejected promises from async handlers go to the error handler automatically; in 4 they don't (the *hang* and the *unhandled rejection* above). 5 also makes `req.query` read-only and changes some path syntax. Check `package.json` first.

**Prisma 5/6 vs 7, since this repo uses 7 and the exercise probably doesn't:** 5/6 use `provider = "prisma-client-js"`, `datasource { url = env(...) }`, `new PrismaClient()` with no adapter, and import from `@prisma/client`. 7 uses `prisma-client`, `prisma.config.ts`, and driver adapters. Don't be thrown by the older style; it's simpler.

## 8. The debugging loop (say it out loud)

1. **Reproduce** with the smallest thing: one failing test or one `curl`.
2. **Read** the error/diff completely. Say what it tells you.
3. **Hypothesise**, and say *what you'd expect to see* if you're right.
4. **Check cheaply**: a `console.log`, the query log, `it.only`, a scratch query. Don't edit code to "see what happens" yet.
5. **Narrow**: which layer? Request parsing → route → service → query → DB → response. `console.log` at the boundaries and bisect.
6. **Fix the cause**, not the symptom, then **rerun the whole suite** (not just the one test).
7. **Explain** what was wrong, and add a test if none caught it.

Useful narration: "The test expects 201 and got 409, so the loan-limit check is firing. Let me log how many active loans it counts."

## 9. Adding a feature: checklist

1. Restate the requirement and **ask about edge cases** (what if the member doesn't exist? already returned? concurrent requests?).
2. **Schema** first if data changes → `npx prisma db push` (or `migrate dev`) → `npx prisma generate`.
3. **Route** (parse and validate input, map to status codes) → **service** (logic, transaction if it touches two tables) → **response shape**.
4. **Errors:** 400 invalid input, 404 missing, 409 conflicts, not a blanket 500.
5. **Test it** (write the test first if you can; it is also your demo).
6. Run the **entire** suite and `npm run typecheck`.

## 10. Conceptual questions that tend to come up (one-line answers)

- **What is middleware?** A function `(req, res, next)` in an ordered pipeline; it ends the request, calls `next()`, or passes an error with `next(err)`. Order matters.
- **How does Express find the error handler?** A function with **four** parameters, registered after the routes.
- **`findUnique` vs `findFirst`?** Unique-field lookup returning `null`, vs first match for arbitrary filters.
- **What does a transaction buy you?** Atomicity: all writes commit or none do. Use `tx` inside.
- **How do you stop two requests taking the last copy?** A *conditional* update (`updateMany` with `copiesAvailable: { gt: 0 }`) and check `count`, inside a transaction.
- **Is Prisma safe from SQL injection?** Yes for the query API and tagged-template raw queries (parameters are bound); not if you build SQL by string concatenation (`$queryRawUnsafe`).
- **What's N+1, and how do you find and fix it?** One query for a list plus one per row; the query log shows it; fix with `include`/`select` or a batched `where: { id: { in } }`.
- **Offset vs cursor pagination?** Offset is simple but gets slower and can skip/duplicate rows as data changes; cursor (`cursor`/`take` on a unique ordered key) is stable and fast.
- **`db push` vs `migrate`?** `push` syncs without history (prototypes); `migrate` records versioned SQL you can review and deploy.
- **How do you test an Express app?** `supertest` against the exported `app` (no real port), a separate test database, reset state between tests.
- **401 vs 403?** Not authenticated vs authenticated but not allowed.
- **How would you add authentication?** Middleware verifying a token, attaching the user to `req`, mounted before protected routes (this repo's `api/` does exactly this).

## 11. Rehearse in the real environment

1. Create a Replit account and a new **Node.js/TypeScript** Repl (or **import this repo from GitHub** and `cd practice`).
2. In the Shell: `npm install`, `cp .env.example .env`, `npx prisma db push`, `npm run db:seed`, `npm test`, `npm run dev`.
3. Find: where the console output goes, where Secrets live, how the Webview reaches port 3100, and what the Run button does.
4. Then do the drills in `practice/`; the environment mechanics will already be familiar.
