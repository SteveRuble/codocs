# library-api (practice exercise)

A small library-lending API: books, authors, members, loans. Deliberately built the way a typical interview or take-home repo is (**Express 4, Prisma 6, CommonJS, Vitest, SQLite**), not the way `api/` in this repo is. It exists to practise reading unfamiliar code, debugging, and adding features.

## Run it

```bash
cd practice
npm install
cp .env.example .env          # DATABASE_URL, PORT
npx prisma db push            # create prisma/dev.db from schema.prisma
npm run db:seed               # sample data
npm run dev                   # http://localhost:3100  (tsx watch: restarts on save)
npm test                      # vitest run: starts from a fresh prisma/test.db each time
```

Try it:
```bash
curl -s "localhost:3100/books?author=herbert"
curl -s localhost:3100/loans/overdue
curl -s -X POST localhost:3100/loans -H 'content-type: application/json' -d '{"memberId":2,"bookId":4}'
```

## Endpoints

| | |
|---|---|
| `GET /books?author=&available=true&page=&pageSize=` | paginated list; `author` is a substring match |
| `GET /books/:id` · `POST /books` | |
| `POST /loans` `{memberId, bookId}` | checkout: 14-day loan; max 3 active loans per member; needs a free copy |
| `POST /loans/:id/return` | |
| `GET /loans/overdue` | unreturned loans past their due date, most overdue first |
| `GET /members/:id/loans?active=true` | |

## Layout

```
src/server.ts          starts the listener          src/app.ts        middleware + route mounting
src/routes/*.ts        HTTP layer                   src/services/     business logic (transactions)
src/lib/               parsing/validation helpers   src/middleware/   error handler
prisma/schema.prisma   the data model               test/             vitest + supertest
```

## Drill rules (so practice resembles the real thing)

The baseline is committed with all tests green. A "drill" modifies files here and gives you a ticket, like an interviewer would. Treat the code as someone else's:

- **Don't** run `git diff` / `git log -p` to find what changed. That's not available in the interview.
- Do use everything a real engineer has: the tests, logs, stack traces, `console.log`, the Prisma query log, docs.
- Think out loud. Say what you expect to see before you run something.
- When done, `git checkout -- practice` resets to the clean baseline.
