import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError, asyncHandler } from "../errors";
import { parseId, parsePositiveInt, requireInt, requireString } from "../lib/parse";

export const booksRouter = Router();

// GET /books?author=tolkien&available=true&page=2&pageSize=10
booksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 10), 50);

    const where: Prisma.BookWhereInput = {};
    if (typeof req.query.author === "string" && req.query.author !== "") {
      where.author = { name: { contains: req.query.author } };
    }
    if (req.query.available === "true") {
      where.copiesAvailable = { gt: 0 };
    }

    const [data, total] = await Promise.all([
      prisma.book.findMany({
        where,
        include: { author: true },
        // `id` is a tiebreaker: without it, equal titles can swap places between pages.
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.book.count({ where }),
    ]);

    res.json({ data, page, pageSize, total });
  }),
);

booksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const book = await prisma.book.findUnique({ where: { id }, include: { author: true } });
    if (!book) throw new AppError(404, "Book not found");
    res.json(book);
  }),
);

booksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const isbn = requireString(body, "isbn");
    const title = requireString(body, "title");
    const publishedYear = requireInt(body, "publishedYear", 1);
    const copies = requireInt(body, "copies", 1);
    const authorId = requireInt(body, "authorId", 1);

    const author = await prisma.author.findUnique({ where: { id: authorId } });
    if (!author) throw new AppError(404, "Author not found");

    try {
      const book = await prisma.book.create({
        data: { isbn, title, publishedYear, copiesTotal: copies, copiesAvailable: copies, authorId },
        include: { author: true },
      });
      res.status(201).json(book);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new AppError(409, "A book with this ISBN already exists");
      }
      throw err;
    }
  }),
);
