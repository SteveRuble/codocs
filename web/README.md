# codocs web

Next.js (App Router) frontend with Tailwind + daisyUI and Auth.js (GitHub).

## GitHub OAuth app

1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
2. Homepage URL: `http://localhost:3000`
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copy the client id and a generated client secret into `.env.local`.

## Environment

```
cp .env.local.example .env.local
```

- `AUTH_SECRET` - Auth.js cookie encryption secret.
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` - from the OAuth app.
- `API_JWT_SECRET` - HS256 secret shared with the Express API.
- `NEXT_PUBLIC_API_URL` - Express base URL (default `http://localhost:4000`).

## Run

```
npm install
npm run dev     # http://localhost:3000
npm run build   # typecheck + production build
```

## How API auth works

Auth.js's session cookie is encrypted, so Express cannot read it. The browser calls
`GET /api/token` (a Next route handler) which reads the session server-side and returns a
1h HS256 JWT (`sub` = GitHub numeric id, `login`, `name`, `email`, `picture`) signed with
`API_JWT_SECRET`. `src/lib/api.ts` caches it and sends `Authorization: Bearer <jwt>` on every API call.
