# 000 – Roadmap

**Goal:** learn Express.js + Prisma ORM + TypeScript well enough to build a small API live in a tech screen.

**App:** *codocs*, a document review tool. Upload a text document, list documents, view one, comment on a line or range of lines, see everyone's comments.

**Layout**

```
api/    Express + Prisma + TypeScript  <- what we learn, step by step
web/    Next.js + daisyUI frontend      <- built by a subagent, not covered here
docs/setup/   one doc per step
```

**How we work:** each step changes code, then writes a `docs/setup/00x_*.md` explaining what and why. You read it, ask questions, commit when you understand it, then tell me to go to the next step.

## Steps

| # | Topic | You'll learn |
|---|-------|--------------|
| 001 | Project scaffold | TS config for Node, Express app/server split, middleware order, 404 + error handler |
| 002 | Prisma setup | Install, `schema.prisma`, datasource, generator, client, SQLite dev DB |
| 003 | Application structure | Composition root, dependency injection by hand, feature modules, config validation, logging, graceful shutdown |
| 004 | Data model | Models, relations, indexes, enums, migrations (`migrate dev`) |
| 005 | Request validation + error handling | Zod at the boundary, a typed `HttpError`, async handlers, consistent error shape |
| 006 | Auth middleware | JWT (Bearer) verification, `req.user`, upserting users, protected routers |
| 007 | Documents: upload + list | `multer`, create, `findMany`, `select`/`include`, `_count` |
| 008 | Documents: view one | `findUnique`, 404 handling, path params, ownership/visibility |
| 009 | Comments | Nested resource, range validation, relations, transactions |
| 010 | Tests | `vitest` + `supertest` against the app factory |
| 011 | Interview drill | Cheat sheet, common questions, how to live-code this from scratch fast |

(Order may shift if something deserves more depth.)

## Running the frontend alongside

The frontend (`web/`) talks to the API contract we're building. It's documented in `web/README.md` once the subagent finishes.
