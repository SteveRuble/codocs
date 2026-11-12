import { prisma } from "../prisma";
import { AppError } from "../errors";
import { addDays, LOAN_DAYS } from "../lib/dates";

export const MAX_ACTIVE_LOANS = 3;

// Checking out a book touches two tables (a new Loan, one fewer copy), so it runs in a
// transaction: either both happen or neither does. Inside the callback, use `tx`, never `prisma`.
export async function checkoutBook(memberId: number, bookId: number) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) throw new AppError(404, "Member not found");

    const book = await tx.book.findUnique({ where: { id: bookId } });
    if (!book) throw new AppError(404, "Book not found");

    const activeLoans = await tx.loan.count({ where: { memberId, returnedAt: null } });
    if (activeLoans >= MAX_ACTIVE_LOANS) throw new AppError(409, "Loan limit reached");

    // Conditional update: only decrements if a copy is still available, and tells us whether it did.
    // (Read-then-write would let two simultaneous requests both take the last copy.)
    const updated = await tx.book.updateMany({
      where: { id: bookId, copiesAvailable: { gt: 0 } },
      data: { copiesAvailable: { decrement: 1 } },
    });
    if (updated.count === 0) throw new AppError(409, "No copies available");

    return tx.loan.create({
      data: { memberId, bookId, dueAt: addDays(new Date(), LOAN_DAYS) },
      include: { book: true },
    });
  });
}

export async function returnLoan(loanId: number) {
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new AppError(404, "Loan not found");
    if (loan.returnedAt !== null) throw new AppError(409, "Loan already returned");

    await tx.book.update({ where: { id: loan.bookId }, data: { copiesAvailable: { increment: 1 } } });
    return tx.loan.update({
      where: { id: loanId },
      data: { returnedAt: new Date() },
      include: { book: true },
    });
  });
}

export async function listOverdueLoans(now = new Date()) {
  return prisma.loan.findMany({
    where: { returnedAt: null, dueAt: { lt: now } },
    include: { member: true, book: true },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
}
