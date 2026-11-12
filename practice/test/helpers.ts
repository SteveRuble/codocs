import { prisma } from "../src/prisma";

// Delete children before parents: foreign keys forbid the other order.
export async function resetDb() {
  await prisma.loan.deleteMany();
  await prisma.book.deleteMany();
  await prisma.member.deleteMany();
  await prisma.author.deleteMany();
}

let counter = 0;
const next = () => ++counter;

export function makeAuthor(name = `Author ${next()}`) {
  return prisma.author.create({ data: { name } });
}

export async function makeBook(overrides: { title?: string; copies?: number; authorId?: number } = {}) {
  const n = next();
  const authorId = overrides.authorId ?? (await makeAuthor()).id;
  const copies = overrides.copies ?? 2;
  return prisma.book.create({
    data: {
      isbn: `isbn-${n}`,
      title: overrides.title ?? `Book ${n}`,
      publishedYear: 2000,
      copiesTotal: copies,
      copiesAvailable: copies,
      authorId,
    },
  });
}

export function makeMember(name = "Member") {
  return prisma.member.create({ data: { email: `m${next()}@example.com`, name } });
}

const DAY = 24 * 60 * 60 * 1000;

export function makeLoan(opts: { memberId: number; bookId: number; dueInDays: number; returned?: boolean }) {
  return prisma.loan.create({
    data: {
      memberId: opts.memberId,
      bookId: opts.bookId,
      loanedAt: new Date(Date.now() - 20 * DAY),
      dueAt: new Date(Date.now() + opts.dueInDays * DAY),
      returnedAt: opts.returned ? new Date() : null,
    },
  });
}
