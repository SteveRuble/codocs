# 001 – Project scaffold

**Outcome:** an Express 5 + TypeScript server in `api/` that answers `GET /health`, returns JSON 404s and JSON 500s. No database yet.

## Prerequisite: Node

Node wasn't installed, so I ran `winget install OpenJS.NodeJS.LTS` (Node 26, npm 11). A new terminal picks up PATH automatically. If `node -v` fails in an old terminal, restart it or VS Code.

## Run it

```powershell
cd api
npm install
copy .env.example .env     # optional; defaults match
npm run dev                # tsx watch: restarts on save
# in another terminal
curl http://localhost:4000/health
curl http://localhost:4000/nope     # JSON 404
```

## What I did, file by file

### `api/package.json`
- `"type": "module"` → the code is **ESM** (`import`/`export`), the modern default.
- Dependencies: `express` (the framework), `cors` (browser cross-origin headers; the frontend runs on :3000, the API on :4000).
- Dev dependencies: `typescript`, `tsx` (runs TS directly, no build step in dev), and `@types/*` (type declarations for libraries written in JS).
- Scripts:
  - `dev`: `tsx watch ...` runs `src/server.ts` and restarts on change.
  - `build`: `tsc` compiles `src` → `dist`.
  - `start`: runs the compiled output with plain `node`.
  - `typecheck`: `tsc --noEmit`, checks types without writing files.
- `--env-file-if-exists=.env` is built into Node, so no `dotenv` package is needed.

### `api/tsconfig.json`
The options worth knowing:
- `module` / `moduleResolution: "NodeNext"`: mirrors how Node resolves ESM. **Consequence:** relative imports need the `.js` extension even though the file is `.ts` (`import { x } from "./config.js"`). TypeScript doesn't rewrite import paths, so you write what Node will see at runtime. This is a classic gotcha. If a screen environment gives you `ERR_MODULE_NOT_FOUND`, check for this first.
- `strict: true`: turns on the whole family of strict checks (`strictNullChecks`, `noImplicitAny`, ...). Always use it.
- `noUncheckedIndexedAccess`: `arr[0]` is typed `T | undefined`, which catches real bugs.
- `rootDir: src`, `outDir: dist`: where input and output live.

### `api/src/config.ts`
All `process.env` reads happen in one place. `process.env.X` is always `string | undefined`, so we validate and convert once, fail fast at startup with a clear message if something required is missing, and the rest of the code gets typed values (`config.port` is a `number`).
Later steps add `JWT_SECRET` and `DATABASE_URL` here.

### `api/src/app.ts`: the heart of Express
`createApp()` builds and returns an Express app. **Why a factory and not just `const app = express()` at the top level?** Tests (step 009) can import `createApp()` and make requests without binding a port.

Key Express ideas shown in this file:

1. **Middleware is a pipeline.** `app.use(fn)` registers `fn(req, res, next)`. Each request passes through registered middleware and routes **in the order registered**, until something sends a response. Order bugs are the #1 Express mistake (e.g. registering a route before `express.json()` means `req.body` is `undefined`).
   - `cors(...)` adds `Access-Control-Allow-Origin` headers; without it the browser blocks the frontend's calls.
   - `express.json()` reads the request body, parses JSON and puts it on `req.body`.
2. **Routes** are `app.get(path, handler)`, `app.post(...)` etc. A handler gets `(req, res)` and ends the request with `res.json(...)`, `res.status(404).json(...)`, etc.
3. **The 404 handler** is just middleware registered *after* all routes. If a request got this far, nothing matched.
4. **The error handler** is recognised by having **four** parameters `(err, req, res, next)`. It must be registered **last**. Anything thrown in a handler, or passed to `next(err)`, lands here. **Express 5** also forwards rejected promises from `async` handlers automatically. In Express 4 you needed a wrapper or `express-async-errors` — a likely interview question, so remember the difference.
5. Every error response uses one shape, `{ error: { code, message } }`, which is exactly what the frontend expects.

### `api/src/server.ts`
Three lines: build the app, call `listen(port)`. This is the only file with side effects.

### `.gitignore`, `.env.example`
The repo-root `.gitignore` only ignores `/node_modules` at the root, so `api/.gitignore` ignores `api/node_modules`, `dist`, and `.env` (secrets never get committed; `.env.example` documents what's needed).

### Root `package.json`: one command for everything
`api/` and `web/` are **independent npm projects**; the root only holds convenience scripts that delegate with `npm --prefix <dir>`, plus `concurrently` to run both servers:

```powershell
npm run install:all   # install deps in api/ and web/
npm run dev           # api on :4000 and web on :3000, one terminal, colour-prefixed logs
npm run typecheck     # both
npm run build         # both
```

**Why not Lerna / Nx / Turborepo?** They add task caching, dependency-aware ordering and versioned publishing, which pay off at many packages. For two packages it's pure overhead. **npm workspaces** (`"workspaces": ["api","web"]` at the root) are the lightweight next step: one hoisted `node_modules` and one lockfile. We skipped them because the packages share no code. If a screen asks, "I'd start with plain scripts, move to workspaces when packages share code, and reach for Turborepo/Nx when build time hurts."

## For a Go developer: how the TS/Node toolchain maps

| Go | TS / Node |
|----|-----------|
| `go.mod` / `go.sum` | `package.json` / `package-lock.json` (commit the lockfile) |
| `go build` → one static binary | `tsc` → a folder of `.js` files; you deploy `dist/` **plus** `node_modules` and a Node runtime |
| `go run .` | `tsx src/server.ts` (esbuild-based, **strips types, does not typecheck**) |
| compiler = typechecker | **Separate concerns.** `tsc` typechecks; `tsx`/esbuild/swc just erase types. A file can run fine in dev and fail `npm run typecheck`. CI should run `typecheck`. |
| `go vet`, `gofmt` | ESLint, Prettier (not set up here) |
| `go test ./...` built in | pick a runner (vitest, step 009); Node also has a built-in `node:test` |
| `init()` + packages | ES modules; imports are executed once, top-level code runs on first import |
| `error` return values | **exceptions** (`throw`) and rejected Promises. Nothing in the type system says a function can throw, and `catch (e)` gives you `unknown`. |
| goroutines + channels | one thread, an event loop, `async/await` over Promises. Blocking the loop (CPU-heavy sync work) stalls *every* request. |
| `context.Context` cancellation | `AbortSignal` (rarely needed here) |
| `net/http` `Handler` + middleware wrapping | Express `(req, res, next)` functions; middleware **mutates** `req`/`res` rather than wrapping handlers |
| struct tags / `encoding/json` | none: types are **erased at runtime**. `req.body as Foo` checks nothing, which is why step 004 adds Zod to validate at the boundary. |
| interfaces satisfied implicitly | same: TS is structural |
| `nil` | `null` **and** `undefined` (two kinds of "nothing"). Prisma uses `null` for empty DB columns. |

## TS things that have changed or that people forget (since ~2020)

You can skim these; most show up in the code we write.
- **ESM is the default now.** `"type": "module"` plus `NodeNext`; relative imports need the `.js` extension (see above). `require()` and `module.exports` are legacy. `__dirname` doesn't exist in ESM; use `import.meta.dirname` (Node 20.11+).
- **Node has absorbed tools:** `--env-file` (replaces dotenv), `--watch`, built-in test runner, global `fetch`, `crypto.randomUUID()`. TS 5.8+ with Node 22+ can even run `.ts` files directly (type stripping), but we use `tsx` because it's more permissive.
- **`satisfies`** (4.9): check a value against a type without widening it. **`const` type parameters** (5.0). **`using` / `await using`** (5.2, explicit resource management, like Go's `defer` for disposal) is rare in practice.
- **`import type`** and `verbatimModuleSyntax`: make type-only imports explicit so they're erased (we do `import { type Express }`).
- **Strictness knobs:** `noUncheckedIndexedAccess` (on here), `useUnknownInCatchVariables` (part of `strict`).
- **Enums:** most teams now prefer string-literal unions (`"A" | "B"`) or `as const` objects. Prisma generates its own.
- **Decorators** have a standard form in 5.0, but Express/Prisma code doesn't use them.
- **TypeScript 7** (what npm installed here) is the native-code rewrite of the compiler: same language, much faster `tsc`.

## Verified

- `npm run typecheck` and `npm run build`: clean.
- Started the compiled server; `GET /health` → `200 {"status":"ok",...}`; `GET /nope` → `404 {"error":{"code":"not_found",...}}`.

## Check your understanding

1. Why does `app.use(express.json())` need to come before routes that read `req.body`?
2. What makes Express treat a function as an error handler?
3. Why `createApp()` instead of exporting an `app` constant?
4. Why do we write `./config.js` when the file is `config.ts`?
5. What's different about async errors in Express 4 vs 5?

## Commit when ready

```powershell
git add api docs
git commit -m "Scaffold Express + TypeScript API"
```

Then say "next" and I'll do **002: Prisma setup**.
