import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { prisma } from "../src/prisma";
import { makeBook, makeLoan, makeMember, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("GET /members/:id/loans", () => {
  it("returns all of the member's loans, newest first, with book titles", async () => {
    const member = await makeMember();
    const other = await makeMember();
    const b1 = await makeBook({ title: "One" });
    const b2 = await makeBook({ title: "Two" });
    await makeLoan({ memberId: member.id, bookId: b1.id, dueInDays: 5, returned: true });
    await makeLoan({ memberId: member.id, bookId: b2.id, dueInDays: 5 });
    await makeLoan({ memberId: other.id, bookId: b1.id, dueInDays: 5 });

    const res = await request(app).get(`/members/${member.id}/loans`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].book).toEqual({ id: expect.any(Number), title: expect.any(String) });
  });

  it("active=true returns only books not yet returned", async () => {
    const member = await makeMember();
    const b1 = await makeBook({ title: "Returned" });
    const b2 = await makeBook({ title: "Still out" });
    await makeLoan({ memberId: member.id, bookId: b1.id, dueInDays: 5, returned: true });
    await makeLoan({ memberId: member.id, bookId: b2.id, dueInDays: 5 });

    const res = await request(app).get(`/members/${member.id}/loans?active=true`);

    expect(res.body.map((l: { book: { title: string } }) => l.book.title)).toEqual(["Still out"]);
  });

  it("404s for an unknown member", async () => {
    const res = await request(app).get("/members/99999/loans");
    expect(res.status).toBe(404);
  });
});

describe("GET /health and unknown routes", () => {
  it("health returns ok", async () => {
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
  });

  it("unknown routes return a JSON 404", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });
});
