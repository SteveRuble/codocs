import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.loan.deleteMany();
  await prisma.book.deleteMany();
  await prisma.member.deleteMany();
  await prisma.author.deleteMany();

  const tolkien = await prisma.author.create({ data: { name: "J.R.R. Tolkien" } });
  const le_guin = await prisma.author.create({ data: { name: "Ursula K. Le Guin" } });
  const herbert = await prisma.author.create({ data: { name: "Frank Herbert" } });

  const day = 24 * 60 * 60 * 1000;
  const books = await Promise.all([
    prisma.book.create({ data: { isbn: "978-0-261-10235-4", title: "The Fellowship of the Ring", publishedYear: 1954, copiesTotal: 3, copiesAvailable: 3, authorId: tolkien.id } }),
    prisma.book.create({ data: { isbn: "978-0-261-10236-1", title: "The Two Towers", publishedYear: 1954, copiesTotal: 2, copiesAvailable: 2, authorId: tolkien.id } }),
    prisma.book.create({ data: { isbn: "978-0-441-47812-5", title: "A Wizard of Earthsea", publishedYear: 1968, copiesTotal: 1, copiesAvailable: 1, authorId: le_guin.id } }),
    prisma.book.create({ data: { isbn: "978-0-441-17271-9", title: "Dune", publishedYear: 1965, copiesTotal: 2, copiesAvailable: 2, authorId: herbert.id } }),
    prisma.book.create({ data: { isbn: "978-0-441-01359-3", title: "Dune Messiah", publishedYear: 1969, copiesTotal: 1, copiesAvailable: 1, authorId: herbert.id } }),
  ]);

  const ada = await prisma.member.create({ data: { email: "ada@example.com", name: "Ada" } });
  await prisma.member.create({ data: { email: "grace@example.com", name: "Grace" } });

  // One overdue loan and one on-time loan for Ada, so the overdue endpoint has something to show.
  const [fellowship, towers] = books;
  await prisma.loan.create({
    data: { memberId: ada.id, bookId: fellowship!.id, loanedAt: new Date(Date.now() - 30 * day), dueAt: new Date(Date.now() - 16 * day) },
  });
  await prisma.book.update({ where: { id: fellowship!.id }, data: { copiesAvailable: { decrement: 1 } } });
  await prisma.loan.create({
    data: { memberId: ada.id, bookId: towers!.id, loanedAt: new Date(), dueAt: new Date(Date.now() + 14 * day) },
  });
  await prisma.book.update({ where: { id: towers!.id }, data: { copiesAvailable: { decrement: 1 } } });

  console.log("Seeded authors, books, members and loans.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
