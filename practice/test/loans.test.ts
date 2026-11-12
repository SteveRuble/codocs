import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { prisma } from "../src/prisma";
import { makeBook, makeLoan, makeMember, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const DAY = 24 * 60 * 60 * 1000;

describe("POST /loans (checkout)", () => {
  it("creates a loan due in 14 days and takes one copy off the shelf", async () => {
    const member = await makeMember();
    const book = await makeBook({ copies: 2 });

    const res = await request(app).post("/loans").send({ memberId: member.id, bookId: book.id });

    expect(res.status).toBe(201);
    expect(res.body.returnedAt).toBeNull();
    const days = (new Date(res.body.dueAt).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect((await prisma.book.findUniqueOrThrow({ where: { id: book.id } })).copiesAvailable).toBe(1);
  });

  it("404s for an unknown book", async () => {
    const member = await makeMember();
    const res = await request(app).post("/loans").send({ memberId: member.id, bookId: 99999 });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown member", async () => {
    const book = await makeBook();
    const res = await request(app).post("/loans").send({ memberId: 99999, bookId: book.id });
    expect(res.status).toBe(404);
  });

  it("409s when no copies are available, and creates no loan", async () => {
    const member = await makeMember();
    const book = await makeBook({ copies: 1 });
    await request(app).post("/loans").send({ memberId: (await makeMember()).id, bookId: book.id });

    const res = await request(app).post("/loans").send({ memberId: member.id, bookId: book.id });

    expect(res.status).toBe(409);
    expect(await prisma.loan.count({ where: { memberId: member.id } })).toBe(0);
  });

  it("409s when the member already has 3 books out", async () => {
    const member = await makeMember();
    for (let i = 0; i < 3; i++) {
      await request(app).post("/loans").send({ memberId: member.id, bookId: (await makeBook()).id });
    }
    const res = await request(app).post("/loans").send({ memberId: member.id, bookId: (await makeBook()).id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/limit/i);
  });

  it("does not count returned loans toward the limit", async () => {
    const member = await makeMember();
    for (let i = 0; i < 3; i++) {
      await makeLoan({ memberId: member.id, bookId: (await makeBook()).id, dueInDays: 5, returned: true });
    }
    const res = await request(app).post("/loans").send({ memberId: member.id, bookId: (await makeBook()).id });
    expect(res.status).toBe(201);
  });

  it("400s when the body is empty", async () => {
    const res = await request(app).post("/loans").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /loans/:id/return", () => {
  it("marks the loan returned and puts the copy back", async () => {
    const member = await makeMember();
    const book = await makeBook({ copies: 1 });
    const loan = (await request(app).post("/loans").send({ memberId: member.id, bookId: book.id })).body;

    const res = await request(app).post(`/loans/${loan.id}/return`);

    expect(res.status).toBe(200);
    expect(res.body.returnedAt).not.toBeNull();
    expect((await prisma.book.findUniqueOrThrow({ where: { id: book.id } })).copiesAvailable).toBe(1);
  });

  it("409s when returned twice, without adding a phantom copy", async () => {
    const member = await makeMember();
    const book = await makeBook({ copies: 1 });
    const loan = (await request(app).post("/loans").send({ memberId: member.id, bookId: book.id })).body;
    await request(app).post(`/loans/${loan.id}/return`);

    const res = await request(app).post(`/loans/${loan.id}/return`);

    expect(res.status).toBe(409);
    expect((await prisma.book.findUniqueOrThrow({ where: { id: book.id } })).copiesAvailable).toBe(1);
  });

  it("404s for an unknown loan", async () => {
    const res = await request(app).post("/loans/99999/return");
    expect(res.status).toBe(404);
  });
});

describe("GET /loans/overdue", () => {
  it("lists only unreturned loans that are past due, most overdue first", async () => {
    const member = await makeMember("Ada");
    const a = await makeBook({ title: "A" });
    const b = await makeBook({ title: "B" });
    const c = await makeBook({ title: "C" });
    const d = await makeBook({ title: "D" });
    await makeLoan({ memberId: member.id, bookId: a.id, dueInDays: -2 });
    await makeLoan({ memberId: member.id, bookId: b.id, dueInDays: -10 });
    await makeLoan({ memberId: member.id, bookId: c.id, dueInDays: -5, returned: true });
    await makeLoan({ memberId: member.id, bookId: d.id, dueInDays: 3 });

    const res = await request(app).get("/loans/overdue");

    expect(res.status).toBe(200);
    expect(res.body.map((l: { book: { title: string } }) => l.book.title)).toEqual(["B", "A"]);
    expect(res.body[0].member.name).toBe("Ada");
  });
});
