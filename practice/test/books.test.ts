import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { prisma } from "../src/prisma";
import { makeAuthor, makeBook, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("GET /books", () => {
  it("returns a page of books with their author and pagination metadata", async () => {
    for (let i = 1; i <= 12; i++) await makeBook({ title: `Title ${String(i).padStart(2, "0")}` });

    const res = await request(app).get("/books?page=2&pageSize=5");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.page).toBe(2);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].title).toBe("Title 06");
    expect(res.body.data[0].author).toHaveProperty("name");
  });

  it("returns the remaining items on the last page", async () => {
    for (let i = 1; i <= 12; i++) await makeBook({ title: `Title ${String(i).padStart(2, "0")}` });
    const res = await request(app).get("/books?page=3&pageSize=5");
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(["Title 11", "Title 12"]);
  });

  it("caps pageSize at 50", async () => {
    const res = await request(app).get("/books?pageSize=1000");
    expect(res.body.pageSize).toBe(50);
  });

  it("filters by author name, case-insensitively, as a substring", async () => {
    const tolkien = await makeAuthor("J.R.R. Tolkien");
    await makeBook({ title: "The Hobbit", authorId: tolkien.id });
    await makeBook({ title: "Dune" });

    const res = await request(app).get("/books?author=tolkien");

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe("The Hobbit");
  });

  it("available=true hides books with no copies left", async () => {
    const out = await makeBook({ title: "Out of stock" });
    await prisma.book.update({ where: { id: out.id }, data: { copiesAvailable: 0 } });
    await makeBook({ title: "In stock" });

    const res = await request(app).get("/books?available=true");

    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(["In stock"]);
  });
});

describe("GET /books/:id", () => {
  it("returns the book with its author", async () => {
    const book = await makeBook({ title: "Dune" });
    const res = await request(app).get(`/books/${book.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Dune");
    expect(res.body.author).toHaveProperty("id");
  });

  it("404s for a book that does not exist", async () => {
    const res = await request(app).get("/books/99999");
    expect(res.status).toBe(404);
  });

  it("400s for a non-numeric id", async () => {
    const res = await request(app).get("/books/abc");
    expect(res.status).toBe(400);
  });
});

describe("POST /books", () => {
  it("creates a book with all copies available", async () => {
    const author = await makeAuthor();
    const res = await request(app)
      .post("/books")
      .send({ isbn: "111", title: "New Book", publishedYear: 2020, copies: 4, authorId: author.id });

    expect(res.status).toBe(201);
    expect(res.body.copiesTotal).toBe(4);
    expect(res.body.copiesAvailable).toBe(4);
  });

  it("400s when a required field is missing", async () => {
    const author = await makeAuthor();
    const res = await request(app).post("/books").send({ isbn: "111", publishedYear: 2020, copies: 1, authorId: author.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it("400s on malformed JSON", async () => {
    const res = await request(app).post("/books").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });

  it("404s when the author does not exist", async () => {
    const res = await request(app).post("/books").send({ isbn: "111", title: "T", publishedYear: 2020, copies: 1, authorId: 424242 });
    expect(res.status).toBe(404);
  });

  it("409s on a duplicate ISBN", async () => {
    const author = await makeAuthor();
    const body = { isbn: "dup", title: "T", publishedYear: 2020, copies: 1, authorId: author.id };
    await request(app).post("/books").send(body);
    const res = await request(app).post("/books").send(body);
    expect(res.status).toBe(409);
  });
});
