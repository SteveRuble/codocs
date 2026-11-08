# 005 – Request validation and error handling

**Outcome:** a single, consistent way to reject bad input and to report failures. Routers and services *throw*; one error handler turns everything into a uniform JSON response. No new routes yet; steps 006–009 use these tools.

**Written for:** you, a Go developer. Error handling is where Go and TypeScript differ most, so there's a lot of contrast below.

## The response contract

Every non-2xx response, from any source, has this shape:

```json
{ "error": { "code": "validation_failed", "message": "Request validation failed",
             "details": [{ "source": "body", "path": "startLine", "message": "Too small: expected number to be >=1" }],
             "requestId": "f5871d02-ca00-45c5-8b43-5fe4719ded9a" } }
```
- `code`: stable, machine-readable (the frontend switches on it). A closed union type, `ErrorCode`, in [errors.ts](../../api/src/http/errors.ts).
- `message`: safe to show a human. **By definition** an `HttpError`'s message is client-safe; nothing else's ever reaches a response.
- `details`: only for validation; every problem at once, with `source` (params/query/body) and `path`.
- `requestId`: same value as the `x-request-id` header and the log lines, so "it broke, id X" finds the log.

(Standards-minded teams use RFC 9457 `application/problem+json` for this. We keep the shape the frontend was built against; mention the RFC if asked.)

## The pieces

| File | Job |
|------|-----|
| [http/errors.ts](../../api/src/http/errors.ts) | `ErrorCode`, `HttpError`, and the `httpErrors.*` constructors |
| [http/validate.ts](../../api/src/http/validate.ts) | `validateRequest(req, { params, query, body })` |
| [http/schemas.ts](../../api/src/http/schemas.ts) | shared schemas (`idParams`) |
| [http/errorMapping.ts](../../api/src/http/errorMapping.ts) | `toHttpError(err)`: pure function, "what was thrown" → `HttpError` or `undefined` |
| [http/middleware/errorHandler.ts](../../api/src/http/middleware/errorHandler.ts) | the only code that writes an error response |
| [http/middleware/notFound.ts](../../api/src/http/middleware/notFound.ts) | now just raises a 404 `HttpError` instead of writing a response |

### Throwing, not returning

```ts
throw httpErrors.notFound("Document");          // 404 { code: "not_found", message: "Document not found" }
throw httpErrors.unprocessable("endLine is past the last line");   // 422
```
Go returns `error` values and you check `if err != nil` at every call. In TypeScript the idiom is the opposite: **throw, and let it bubble to one handler**. Consequences:
- Nothing in the type system says a function can throw. You can't tell from a signature, so convention and docs matter.
- `catch (e)` gives you `unknown` (under `strict`), the same as having to type-assert an `error` in Go. You narrow with `instanceof`, like `errors.As`.
- **Express 5 handles async for you.** A `throw` inside an `async` handler, or a rejected promise, reaches the error handler automatically. Express 4 needed `express-async-errors` or a wrapper on every route (`asyncHandler(fn)`); you'll see that in older code and tutorials. We don't need it.

`HttpError extends Error` with `status`, `code`, `message`, optional `details`, and a `cause`. `cause` is the standard ES2022 way to chain errors, like `fmt.Errorf("...: %w", err)`; it's what the logs show for 5xx.

Note the field declarations are written out rather than as `constructor(readonly status: number, ...)`. That shorthand ("parameter properties") is not erasable syntax: Node's native TypeScript stripping and `erasableSyntaxOnly` don't support it. Avoiding it keeps the code runnable without a TS compiler in the loop.

### Status code choices

| Status | `code` | Use for |
|--------|--------|---------|
| 400 | `validation_failed`, `invalid_json`, `bad_request` | the request is malformed: wrong shape, wrong types, unparseable |
| 401 | `unauthorized` | no/invalid credentials (step 006) |
| 403 | `forbidden` | authenticated but not allowed |
| 404 | `not_found` | |
| 409 | `conflict` | would violate a uniqueness or relational rule |
| 413 | `payload_too_large` | |
| 422 | `unprocessable` | well-formed, but breaks a business rule (a comment past the last line) |
| 500 | `internal_error` | a bug or outage |

The 400/422 split is a convention, not a law. Many APIs use 400 for everything. What matters is being consistent and documenting it.

### Validation at the boundary

**Why it's needed.** TypeScript types are erased at compile time, so `req.body as CreateComment` is a lie the compiler accepts: it validates nothing about the bytes off the network. In Go, `json.Unmarshal` into a struct at least enforces *types* (and a validator package enforces tags). Here you validate explicitly, and **Zod** gives you the validator and the type at once: the schema is the single source of truth, and its output type is derived from it (`z.output<typeof schema>`, or `z.infer`), where Go has the struct tag and the struct separately.

```ts
const createComment = z.object({
  startLine: z.int().min(1),
  endLine:   z.int().min(1),
  body:      z.string().trim().min(1).max(5000),
}).strict();

// in a handler:
const { params, body } = validateRequest(req, { params: idParams, body: createComment });
//      ^ params.id: string        ^ body.startLine: number     (real types, not any)
```
Behaviours I confirmed by running it:
- **All problems are reported at once**, across params/query/body, not just the first.
- `.trim()` is applied: `"  hello  "` arrives as `"hello"`. Schemas can *transform*, so the parsed value can differ from the input; that's why `validateRequest` **returns** the result instead of checking and discarding it.
- **`.strict()` rejects unknown keys.** Zod's default is to silently *strip* them. Strict catches client typos (`startline`) instead of ignoring them; use it for write endpoints.
- A missing body is `undefined` in Express 5 (not `{}`), so it fails as "expected object, received undefined". Good: it can't be silently treated as empty.
- **Query strings are always strings.** `z.coerce.number()` turns `"5"` into `5` and applies defaults (`/list` → `limit: 20`), and rejects `1000` against `.max(100)`. **Trap:** `z.coerce.boolean()` turns the string `"false"` into `true` (any non-empty string is truthy). Parse booleans from query strings explicitly.
- We return the parsed values rather than assigning to `req.body`/`req.query`. In Express 5, `req.query` is a read-only getter, so the old "validation middleware overwrites req.query" pattern doesn't work. Express 5 also defaults to the "simple" query parser, which doesn't build nested objects from `a[b]=c`.

Where does validation end and business logic begin? **Validation** is about the shape of one request, independent of state (is `startLine` an integer ≥ 1?). **Business rules** need data (is `endLine` ≤ the document's `lineCount`?) and live in the service, throwing `unprocessable` (422). Constraints like "start ≤ end" can be checked in either; we'll put it in the Zod schema with `.refine` in step 009 so it's reported as a validation error.

### Mapping library errors

[errorMapping.ts](../../api/src/http/errorMapping.ts) is a pure function with a strict priority order:
1. An `HttpError`: what we threw on purpose, used as is.
2. Known library errors: body-parser's `entity.parse.failed` → 400 `invalid_json`, `entity.too.large` → 413.
3. Prisma's known errors, as a **safety net**:

   | Prisma | Becomes |
   |--------|---------|
   | `P2025` record not found | 404 |
   | `P2002` unique constraint | 409 |
   | `P2003` foreign key / restrict | 409 |
4. Anything else: `undefined` → a bug → 500.

**The rule that makes this safe:** messages are written *here*, never copied from the source error. A Prisma or driver message can contain SQL, table names, or user content. Verified: a plain `Error("SELECT * FROM secrets WHERE password='hunter2' failed")` reached the client only as "Something went wrong".

**Services should check, not rely on the net.** For "does this document exist?", the service does `findUnique` and throws `notFound("Document")` itself, giving a good message. The Prisma mapping exists for races a check can't see (two requests inserting the same unique value at once), and oversights. That's why the handler logs a **warn** when it fires: seeing it in the logs means a service skipped a check.

### The error handler

```ts
const requestId = String(req.id);
const httpError = toHttpError(err);
if (httpError && httpError.status < 500) { …log at debug (warn for Prisma)…; respond }
else { req.log.error({ err: httpError?.cause ?? err }); respond with generic 500 }
```
- **Client errors (4xx)** log at *debug* with only the classification, never the error object. Body-parser errors carry the raw request body, and logging them would write the user's payload (passwords?) to disk. We found this in step 003.
- **Server errors (5xx)** log everything, including the stack, and tell the client nothing except the request id.
- The `res.headersSent` guard and the four-argument signature are unchanged from 003.

### 404 routing
`notFoundHandler` now calls `next(new HttpError(404, ...))` instead of writing its own JSON. It's a small change with a rule behind it: **exactly one place produces error bodies**, so the contract can't drift.

## Go contrast

| Go | This codebase |
|----|---------------|
| `return nil, err` up the call stack | `throw`, caught only by the error handler |
| sentinel errors (`ErrNotFound`) and `errors.Is` | `HttpError` with a `code`; `instanceof` |
| `errors.As(err, &target)` | `err instanceof Prisma.PrismaClientKnownRequestError` |
| `fmt.Errorf("…: %w", err)` | `new HttpError(…, { cause: err })` |
| struct tags + `validator.Struct(x)` | Zod schema, and the type is derived from it |
| `http.Error(w, …)` scattered through handlers | one handler writes every error |
| `recover()` middleware for panics | Express 5 catches throws and rejections itself |
| the compiler warns about unchecked errors (`errcheck`/linters) | nothing warns you; discipline and the safety net matter more |

## How I verified it

A throwaway app (deleted afterwards) mounted the real middleware with routes that fail in each way, and hit it with `fetch`. All matched the design:
- valid input (with `.trim()` applied); an invalid body reporting several problems at once, including the `.strict()` extra key; a missing body; malformed JSON → `invalid_json`; an oversized body → 413
- query coercion, default and rejection
- `HttpError` thrown synchronously, in `async` code, and as a 422
- real Prisma errors: `P2025`→404, `P2002`→409, `P2003`→409 (against your seeded `dev.db`; nothing was modified)
- a plain `Error` and a `TypeError` in async code → 500, no leakage, full detail in the server log
- an unknown route → 404 in the standard shape
- a `@ts-expect-error` line proved that `validateRequest`'s result is typed (`string` ≠ `number`), not `any`

`npm run typecheck` and `npm run build` are clean. **Not covered:** these are manual checks, not a repeatable test suite. Step 010 turns them into real tests with vitest and supertest.

## Check your understanding

1. Why does `validateRequest` return the parsed values instead of mutating `req.body`?
2. What is the difference between a validation error and a 422? Where would "endLine is greater than the document's lineCount" be checked?
3. Why must an `HttpError`'s message be client-safe, and what stops a Prisma error's message from leaking?
4. What is `toHttpError`'s Prisma branch for, if services are supposed to check things themselves?
5. Why are 4xx errors logged without the error object?
6. What does Express 5 do for an `async` handler that rejects, and what did Express 4 need?
7. A client sends `?limit=abc`. What happens, and where?

## Commit when ready

```powershell
git add api docs
git commit -m "Add HttpError, request validation with Zod, and centralised error mapping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Then say "next" and I'll do **006: Auth middleware**: verifying the frontend's Bearer JWT, building `req.user`, upserting the `User` row, and protecting routers. That's the step that needs your GitHub OAuth app for the full browser flow, though I can test it end to end without GitHub using tokens I mint.
