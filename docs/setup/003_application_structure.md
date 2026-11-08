# 003 – Application structure

**Outcome:** the API is restructured the way a mature Express codebase is organised: explicit dependency injection from a composition root, feature modules with their own routers, validated config, structured logging, and graceful shutdown. No new features; every later step plugs into this shape.

**Written for:** you, a Go developer who wants to see how production Express/TypeScript services are put together, not a tutorial layout.

**Why a step on its own:** steps 001 and 002 were deliberately minimal (health check inline in `app.ts`, a global `prisma` singleton, `process.env` read at import time). That's the "one tutorial" shape. This step replaces it before we build on it, and fixes several defects I introduced earlier (listed at the end).

## Run it

```powershell
cd api
copy .env.example .env      # NODE_ENV, PORT, LOG_LEVEL, WEB_ORIGIN, DATABASE_URL (the last two are now required)
npm run dev                 # pretty logs in development
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

`/health` and `/health/db` from earlier steps no longer exist. They're replaced by `/health/live` and `/health/ready`.

## The layout

```
api/src/
  server.ts                       composition root: read env, build dependencies, listen, shut down
  app.ts                          createApp(deps): middleware order + mounting feature routers
  config.ts                       loadConfig(env) → typed, validated, frozen Config
  deps.ts                         AppDeps: the dependencies every module may ask for
  infra/                          adapters to the outside world
    db.ts                           createPrismaClient(url)
    logger.ts                       createLogger(config)
  http/
    middleware/                   cross-cutting HTTP concerns (not tied to one feature)
      requestLogger.ts
      notFound.ts
      errorHandler.ts
  modules/                        one folder per feature
    health/
      health.router.ts
    (documents/, comments/, auth/ arrive in later steps)
```

**Convention for the rest of the project:** organise by **feature** (`modules/documents/…`), not by technical layer (`controllers/`, `services/`, `models/` at the top level). When you change "documents", the files live together. Each feature folder will contain:

- `<feature>.router.ts` — thin: parse/validate the request, call the service, shape the response.
- `<feature>.service.ts` — business rules and the Prisma calls. Knows nothing about `req`/`res`.
- `<feature>.schemas.ts` — Zod schemas for its inputs (step 005).

`infra/` holds things that talk to external systems and are constructed once; `http/` holds Express machinery shared by every feature.

## Dependency injection, by hand

**Question: does Express have an IoC container?** No, and there's no standard one. Express has no DI concept. Containers exist (InversifyJS, tsyringe, TypeDI, awilix) but none dominates, and the decorator-based ones need `reflect-metadata` and compiler flags. The only mainstream DI system is **NestJS**, which is a different framework built around it. The overwhelmingly common Express practice is what we did: **factory functions that take their dependencies as parameters, wired once in a composition root.** That's also how idiomatic Go works, with `main()` constructing everything and passing it down.

How it fits together:

```ts
// server.ts: the only place real things are built
const config = loadConfig();
const logger = createLogger(config);
const prisma = createPrismaClient(config.databaseUrl);
const app    = createApp({ config, logger, prisma });

// app.ts: passes the bag down, never reads the environment or imports a singleton
app.use("/health", createHealthRouter(deps));

// health.router.ts: declares only what it needs
export function createHealthRouter({ prisma }: Pick<AppDeps, "prisma">): Router
```

- `AppDeps` is a plain interface. `Pick<AppDeps, "prisma">` is a structural subset: the signature documents the module's real requirements, and a test passes a fake object with only those keys. Go would use a small interface (`type DB interface{ Ping(ctx) error }`); TypeScript's structural typing gives you the same thing, but note Prisma's client type is large, so depending on a narrower interface (what a service actually calls) is the next refinement when we write services.
- **No global state.** Compare step 002's `export const prisma = new PrismaClient(...)`: importing the module opened a database connection as a side effect, and tests couldn't substitute it.
- **Module-level code in ESM runs once on first import.** That's why a top-level `const` is a singleton, and why side effects at import time are a smell: they run whether or not anything uses them.

## Piece by piece

### `config.ts`: validate at the boundary
`process.env` is `string | undefined` per key. We parse it once with **Zod** into a typed, `Object.freeze`d object, and fail fast with a readable message listing every problem:

```
Invalid environment configuration:
✖ Invalid URL
  → at WEB_ORIGIN
✖ Invalid input: expected string, received undefined
  → at DATABASE_URL
```
- `loadConfig(env = process.env)` is a **pure function of its input**. A test calls `loadConfig({ ...valid, PORT: "0" })` without mutating the real environment.
- `z.coerce.number()` converts `"4000"` to `4000`, because env values are always strings.
- **No defaults for `DATABASE_URL` or `WEB_ORIGIN`.** A missing production value should stop the process, not quietly use a dev database. `.env.example` documents them.
- `type Config = ReturnType<typeof loadConfig>`: derive the type from the function instead of writing it twice.
- **Zod 4 note:** top-level helpers like `z.url()` and `z.prettifyError()` are the current API; older tutorials show `z.string().url()`.

### `infra/logger.ts` and `http/middleware/requestLogger.ts`: structured logging
- **pino** is the de-facto Node logger: one JSON object per line in production (what log aggregators ingest), human-readable via `pino-pretty` only when `NODE_ENV=development`.
- `pino-http` adds `req.log`, a child logger carrying a **request id**. We honour an incoming `x-request-id` (e.g. from a gateway) only if it matches a safe pattern, otherwise generate a UUID, and echo it back in the response header so a user's bug report can be traced to log lines.
- **Redaction:** `redact: ["req.headers.authorization", …]` censors credentials. We *also* use an **allowlist serializer** that logs only `id`, `method`, `url`, and `statusCode`. The default dumps every request and response header; allowlisting is safer than denylisting because a forgotten header can't leak.
- Health probes are excluded from access logs; orchestrators hit them every few seconds.
- `req.log` is typed because `pino-http` augments Node's `IncomingMessage` type via declaration merging, the TypeScript way to extend someone else's type.

### `app.ts`: the one place the middleware order is visible
```
requestLogger → helmet → cors → express.json({limit}) → routers → notFound → errorHandler
```
- `requestLogger` first so everything after it, including the error handler, has `req.log`.
- `helmet()` sets security headers (and removes `X-Powered-By`). For a JSON API most are moot, but it's the standard baseline; know that browsers ignore `Strict-Transport-Security` on plain `http://localhost`.
- `express.json({ limit: "100kb" })`: **always cap body size**. The default is also 100kb, but stating it makes the limit a decision. File uploads (step 007) use `multer` with its own, larger, explicit limit.
- Routers mount with a prefix; `app.ts` decides the URL, the module decides the routes under it.

### `http/middleware/errorHandler.ts`
- Still the four-argument signature, still last. New: `if (res.headersSent) return next(err)`. Once a response has started streaming you can't send a clean JSON error; handing it to Express's default handler closes the connection instead of corrupting the response.
- **Malformed JSON used to return a 500.** `express.json` throws an error with `status: 400` and `type: "entity.parse.failed"`; the old handler ignored that and called it an internal error. Now known client errors map to stable codes (`invalid_json` 400, `payload_too_large` 413) and the response never echoes `err.message`.
- **Logging hygiene:** the first version logged the whole error, and body-parser attaches the raw request `body` to its error, so a malformed login request would have written the user's payload into the logs. We log only the classification. Step 005 adds our own `HttpError` here.

### `modules/health/health.router.ts`: liveness vs readiness
Orchestrators ask two different questions:
- **`/health/live`**: is the process running? Failure ⇒ restart it. It must **not** touch the database, or a DB outage restarts every healthy instance and makes things worse.
- **`/health/ready`**: can it serve traffic? Runs `SELECT 1`. Failure ⇒ return `503` so the load balancer stops routing here, without restarting.

Note it no longer deals with `bigint`: it only needs to know whether the query succeeded, not read the value.

### `server.ts`: composition root and process lifecycle
- `loadConfigOrExit` prints the config error and exits with code 1 instead of dumping a stack trace.
- **Graceful shutdown.** On `SIGTERM` (what Kubernetes/ECS/systemd send) or `SIGINT` (Ctrl+C): `server.close()` stops accepting connections and lets in-flight requests finish, then `prisma.$disconnect()`, then exit. A 10-second timer (`.unref()` so it doesn't itself keep the process alive) is the safety net. Go equivalent: `signal.NotifyContext` + `http.Server.Shutdown(ctx)`.
- **`unhandledRejection` ⇒ log and exit.** A promise rejection nobody handled means the process is in an unknown state; the standard practice is to crash and let the supervisor restart you. (Node's default has been to crash since v15; the handler just makes sure it's logged.)
- Node is single-threaded: one uncaught exception takes down *all* concurrent requests, which is why the discipline above matters more than in Go, where a panic in a goroutine is similarly fatal but handlers are typically recovered by middleware.

## Go contrast

| Go | This codebase |
|----|---------------|
| `main()` constructs and wires everything | `server.ts` |
| constructor functions returning structs with injected fields | factories returning routers/handlers that close over their deps |
| small consumer-side interfaces | `Pick<AppDeps, …>` / narrow structural types |
| `os.Getenv` + manual parsing/`envconfig` | Zod-parsed `Config` |
| `slog`/`zap`, `context` carrying a request-scoped logger | `pino` + `req.log` |
| `http.Server.Shutdown(ctx)` | `server.close()` + `$disconnect()` |
| recover-middleware for panics | Express 5 error handler for thrown errors / rejected promises |
| `internal/` packages | `modules/` by feature; TS has no import-visibility enforcement without a lint rule |

## Defects from earlier steps fixed here

1. **`postinstall` would break fresh clones/CI.** `prisma.config.ts` required `DATABASE_URL`, and `prisma generate` runs in `postinstall`, where there's no `.env`. I found this by running `generate` with `.env` removed. Now `generate` alone tolerates a missing URL; every other Prisma command (including `migrate`) still fails loudly, which I also checked. We deliberately don't give `migrate` a fallback, since silently migrating a default file is worse than failing.
2. Global `prisma` singleton created at import time → factory + injection.
3. Config read from `process.env` at import time → validated pure function.
4. Malformed JSON → 500; now 400 `invalid_json`.
5. No request ids, no structured logs, secrets could reach logs → pino with redaction and allowlist serializers.
6. No graceful shutdown.

## How I verified it

Servers I started for testing ran on **port 4100**, since your `npm run dev` already occupies 4000 (and its watcher hot-reloaded these changes, so you may have seen the new behaviour already).
- `npm run typecheck`, `npm run build`: clean.
- `/health/live` and `/health/ready` return 200 with the expected bodies; unknown route → 404 JSON; invalid JSON → 400 `invalid_json`; oversized body → 413 `payload_too_large`.
- `x-request-id` is generated, and a safe caller-supplied one is honoured.
- With `Authorization: Bearer …` on a request, the log shows `[Redacted]` (checked before adding the allowlist serializer). After it, each request logs one short line with id, method, url, status and timing.
- Bad config exits with code 1 and a readable message.
- **Not verified: graceful shutdown.** My test harness is Windows, where killing a process doesn't deliver `SIGTERM`/`SIGINT` to Node's handlers, so the shutdown code was typechecked but never executed. You can exercise it: press Ctrl+C in the `npm run dev` terminal (or run `npm run build && npm start` and Ctrl+C) and look for the `shutting down` log line followed by a clean exit. Tell me if it doesn't, and we'll fix it.
- `/health/ready` returning 503 when the database is down was also not exercised.

## Check your understanding

1. Why does `createHealthRouter` take `Pick<AppDeps, "prisma">` rather than all of `AppDeps`?
2. Why must liveness not check the database?
3. What goes wrong if `requestLogger` is registered after `express.json()`? After the router?
4. Why log an allowlist of fields instead of everything minus the secrets?
5. What does `res.headersSent` protect against in the error handler?
6. Why does `loadConfig` take the environment as a parameter?
7. When would you reach for a DI container (or NestJS) instead of this?

## Commit when ready

```powershell
git add api docs
git commit -m "Restructure API: composition root, feature modules, config validation, logging" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Then say "next" and I'll do **004: Data model**: the Prisma schema, relations, indexes, and the first real migration.
