# 006 – Auth middleware

**Outcome:** everything under `/api` requires a valid signed-in user. The API verifies the Bearer token the Next.js app mints, creates or refreshes the local `User` row, and exposes the user to handlers. `GET /api/me` is the first protected route.

**Written for:** you, a Go developer who has written HTTP middleware and used `context.WithValue` for request-scoped data.

## The flow

```
Browser ── GitHub OAuth ──► Next.js (Auth.js session cookie)
Browser ─► GET /api/token (Next.js) ─► { token: <HS256 JWT, 1h> }
Browser ─► Express  GET /api/me   Authorization: Bearer <jwt>
                    │
   requestLogger → helmet → cors → json → /api router
                                            │ authenticate:
                                            │  1. parse header         → 401 if absent/malformed
                                            │  2. verify JWT           → 401 if forged/expired/wrong audience
                                            │  3. upsert User row      (read-only if nothing changed)
                                            │  4. req.user = user ; req.log gets userId
                                            ▼
                                         /me router → currentUser(req) → JSON
```
**Authentication** answers *who is calling?* (this step). **Authorization** answers *may they do this?* (per feature, starting in step 007/008). A failed authentication is **401**; failed authorization is **403**.

## What changed

| File | Job |
|------|-----|
| [modules/auth/token.ts](../../api/src/modules/auth/token.ts) | `createTokenVerifier`: verifies the JWT, returns a `GitHubProfile` or throws a 401 |
| [modules/auth/authenticate.ts](../../api/src/modules/auth/authenticate.ts) | the middleware |
| [modules/auth/auth.types.ts](../../api/src/modules/auth/auth.types.ts) | types `req.user` |
| [modules/auth/currentUser.ts](../../api/src/modules/auth/currentUser.ts) | `currentUser(req)`: non-optional access to the user |
| [modules/users/users.service.ts](../../api/src/modules/users/users.service.ts) | `upsertFromGitHub`: the first real *service* |
| [modules/users/me.router.ts](../../api/src/modules/users/me.router.ts) | `GET /api/me` |
| [modules/api.router.ts](../../api/src/modules/api.router.ts) | the protected router; every later feature mounts here |
| `config.ts`, `.env.example` | new required `API_JWT_SECRET` (min 32 chars) |
| `errorHandler.ts`, `errors.ts` | `WWW-Authenticate` on 401; `unauthorized(message, cause)` |
| **`web/src/app/api/token/route.ts`** | **two lines added** (issuer/audience), see below |

### Frontend change you should know about
The frontend minted tokens with no issuer or audience. I added `.setIssuer("codocs-web").setAudience("codocs-api")` to its token route, and the API requires both. Reason: the same secret could sign tokens for other purposes; an audience check means a token minted for something else isn't accepted here. The two sides must agree, and the constants are in `token.ts` (`JWT_ISSUER`, `JWT_AUDIENCE`) with comments pointing at each other. Restart the Next.js dev server so it picks up the change.

`API_JWT_SECRET` in `api/.env` is a copy of the value already in your `web/.env.local` (I copied it without printing it). They must match.

## Middleware, in depth

```ts
export function createAuthenticate({ verifier, users }): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? "");
    if (!match?.[1]) throw httpErrors.unauthorized("Authentication required");
    const profile = await verifier.verify(match[1]);
    const user = await users.upsertFromGitHub(profile);
    req.user = user;
    req.log = req.log.child({ userId: user.id });
    next();
  };
}
```
- A middleware is `(req, res, next)`. It either ends the request, calls `next()` to continue, or (here) throws. **Express 5 awaits async middleware**, so a thrown error or rejected promise goes to the error handler. In Express 4 an async middleware that threw would leave the request hanging.
- **Go contrast:** a Go middleware *wraps* the next handler (`func(next http.Handler) http.Handler`) and passes request-scoped data via `context.WithValue(r.Context(), key, user)`, retrieved with a typed key. Express middleware is a flat list and communicates by **mutating `req`**. It's less rigorous (anything can write `req.user`) and compensated for with types, below.
- The scheme match is case-insensitive per the RFC (`bearer` works; tested).
- `req.log.child({ userId })`: every log line for the rest of this request now carries the user id, automatically.

### Applying it once, at the top of a router
```ts
const api = Router();
api.use(authenticate);
api.use("/me", createMeRouter());
```
Protection is **the default** for everything mounted on `api`; a new feature router can't forget it. Public routes (`/health`) sit outside. A consequence I checked: an unknown `/api/whatever` returns **401** to an unauthenticated caller (and 404 to an authenticated one), so strangers can't probe which routes exist.

### Typing `req.user`
```ts
declare global { namespace Express { interface Request { user?: User } } }
```
**Declaration merging** adds a property to a type defined elsewhere; it's how `req.log` (from pino-http) works too. It must be optional, because it doesn't exist before `authenticate` runs. To avoid `req.user!` or `if (!req.user)` in every handler:

```ts
const user = currentUser(req);   // User, never undefined
```
`currentUser` throws a plain `Error` (a 500, not a 401) if the user is missing. That situation means a route was mounted *without* `authenticate`, a programming mistake, and it must **fail closed** rather than silently run as "no user".

### Responses are DTOs
`me.router.ts` returns an explicit object, not the Prisma row. The row has an `email` the contract doesn't promise and timestamps; `res.json(user)` would also automatically leak any column added later. Always spell the response shape out.

## Verifying the token

```ts
await jwtVerify(token, key, {
  algorithms: ["HS256"], issuer, audience,
  requiredClaims: ["sub", "exp"], clockTolerance: 5,
});
```
**JWT in one paragraph:** three base64url parts, `header.payload.signature`. The payload is *readable by anyone* (it's encoded, not encrypted); the signature proves it hasn't been altered and was made by someone holding the key. So never put secrets in it, and never trust a payload you haven't verified.

Why each option matters, all of which I tested with forged tokens (every one got 401):

| Attack / mistake | Defence | Tested |
|------------------|---------|--------|
| signed with a different key | signature check | ✔ |
| expired | `exp` is checked | ✔ |
| `alg: none` (unsigned token claiming to be valid) | algorithm pinned to HS256 | ✔ |
| HS384 or other algorithm | algorithm pinned | ✔ |
| token minted for another service | `iss` / `aud` checked | ✔ wrong and missing |
| a token that never expires | `exp` required | ✔ |
| valid signature, nonsense payload | payload validated by a Zod schema | ✔ missing `login` |

**Pin the algorithm.** If a library takes the algorithm from the token's own header, an attacker picks it. That is the root of the "alg: none" and RS256→HS256 confusion attacks that made JWTs notorious.

**One error message for every failure.** The client always sees `"Invalid or expired token"`; the real reason (jose's error) rides along as `cause` and is available in server logs. Telling an attacker *which* check failed only helps them.

**Key encoding:** the frontend signs with `TextEncoder().encode(secret)`, the raw UTF-8 bytes of the string, so we must import the key the same way. If you ever see every valid token rejected as a bad signature, check this first.

### Design trade-offs you should be able to discuss
- **HS256 (shared secret)** is simple but *symmetric*: whoever can verify can also forge, so the API server could mint tokens for anyone. Fine for two components you own. With many services or third-party verifiers you'd use **RS256/ES256 with a JWKS endpoint**, where only the issuer holds the private key.
- **Alternative: send GitHub's own access token and have the API call GitHub to check it.** No shared secret, but adds a network round-trip to GitHub on every request (or a cache) and couples us to their availability.
- **Revocation:** a stateless JWT can't be revoked before it expires. That's why it's short-lived (1h). If you need instant revocation you add a denylist or session store, and give up some statelessness.
- **Refresh:** when the token expires the API returns 401, and the frontend re-fetches `/api/token` (the browser still has its Auth.js session). The frontend client caches the token until `expiresAt`.

## The user service

```ts
async upsertFromGitHub(profile): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { githubId } });
  if (existing && sameFields) return existing;       // common case: one read, no write
  return prisma.user.upsert({ where: { githubId }, create: profile, update: {...} });
}
```
- Identity is `githubId` (GitHub's numeric id, from the JWT `sub`); `login` can change on GitHub, and we refresh it. Tested: a renamed login updated the *same* row (same id, count still 1).
- **Common path = no write.** This runs on every request; checking first means `updatedAt` isn't bumped and the database isn't written to constantly. Tested (`updatedAt` unchanged on repeat).
- **Atomic upsert for the first request.** A browser often fires several API calls at once on page load. If each did "find, then create", two of them would both see "no user" and one insert would hit the unique constraint. `upsert` is a single atomic operation. Tested with 8 simultaneous first requests: all `200`, exactly one row.
- **Cost to know about:** one database read per authenticated request. Fine at this scale; if it ever matters, cache by `githubId` with a short TTL.
- **Services vs routers:** this is the first *service*: plain values in, plain values out, no `req`/`res`. That's the layering convention from step 003.

## CORS and the preflight
Browsers send an `OPTIONS` **preflight** before a cross-origin request carrying an `Authorization` header, and that request has *no* credentials. It must not hit `authenticate`. It doesn't: `cors()` is registered earlier and answers it itself. Verified: `OPTIONS /api/me` with no token returns `204` and allows the `authorization` header. A common bug is registering auth before CORS, so the browser's preflight gets a 401 and the real request is never sent.

## Go contrast

| Go | This codebase |
|----|---------------|
| `func(next http.Handler) http.Handler` | `(req, res, next)` flat middleware list |
| `ctx = context.WithValue(ctx, userKey, u)` | `req.user = u`, typed with declaration merging |
| `UserFrom(ctx) (User, bool)` | `currentUser(req)`, which throws |
| `jwt.Parse(tok, keyFunc)` with a `Method` check in the key func | `jwtVerify(..., { algorithms: ["HS256"] })` |
| `http.Error(w, "unauthorized", 401)` in the middleware | `throw httpErrors.unauthorized(...)` to the central handler |

## How I verified it

A throwaway script (deleted afterwards) ran the real app against a **copy** of your database. Your `dev.db` still has just the two seeded users. Every check below behaved as designed:
- missing header / Basic scheme / `Bearer` with no token / garbage → 401 with `WWW-Authenticate: Bearer`
- wrong key, expired, HS384, wrong issuer, wrong audience, missing issuer, no expiry, `alg: none`, valid signature with a missing claim → all 401, same generic message
- valid token → 200 and the user row is created; lowercase `bearer` works; repeat requests don't write; a changed login refreshes the same row
- 8 concurrent first requests → all 200, one row
- `/health/live` needs no auth; unknown `/api` route is 401 unauthenticated, 404 authenticated; preflight is 204

`npm run typecheck` (api and web) and `npm run build` are clean.

**Not verified:** the real end-to-end flow. I had no way to sign in with GitHub, so the actual Next.js `/api/token` route has not been run against this API; my test tokens imitate its output (same claims, same signing). You can do the real check now:
1. Restart `npm run dev` from the repo root (the API needs the new env var and the web app needs the token change).
2. Sign in at http://localhost:3000, then open the browser's network tab: calls to `http://localhost:4000/api/...` should carry `Authorization: Bearer …`.
3. In the console: `fetch("http://localhost:4000/api/me", { headers: { Authorization: "Bearer " + (await (await fetch("/api/token")).json()).token } }).then(r => r.json())` should return your GitHub login. (The frontend's document pages will 404 on the API until steps 007–009; that's expected.)

If sign-in works but `/api/me` returns 401, check that `API_JWT_SECRET` is identical in both env files. Set `LOG_LEVEL=debug` in `api/.env` to see why: the error handler logs the reason for 401s only (for example `signature verification failed` or `"exp" claim timestamp check failed`; the token and key are never logged). I initially forgot to log it, and caught that by checking the claim in this doc against the code; it's now covered by a run that forged both cases.

## Check your understanding

1. What's the difference between 401 and 403, and which does `authenticate` produce?
2. Why is the algorithm pinned, and what would an `alg: none` token do if it weren't?
3. Why does `currentUser` throw a plain `Error` rather than an `HttpError(401)`?
4. Why does the common path of `upsertFromGitHub` do a read first instead of always calling `upsert`? And why is `upsert` still needed?
5. Why does an unauthenticated request to `/api/nope` get 401 rather than 404?
6. What breaks if `authenticate` is registered before `cors()`?
7. What would you change to support instant revocation, or multiple verifying services?

## Commit when ready

```powershell
git add api web docs
git commit -m "Add JWT bearer authentication, user service, and protected /api router" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(`web/src/app/api/token/route.ts` is the only frontend file in this commit.)

Then say "next" and I'll do **007: Documents: upload and list**: `multer` for multipart uploads, the first feature with a router, service, schemas and real Prisma queries.
