import { Router } from "express";
import { asyncHandler } from "../errors";
import { parseId, requireInt } from "../lib/parse";
import { checkoutBook, listOverdueLoans, returnLoan } from "../services/loans";

export const loansRouter = Router();

// Registered before "/:id/return" so "overdue" is never mistaken for an id.
loansRouter.get(
  "/overdue",
  asyncHandler(async (_req, res) => {
    res.json(await listOverdueLoans());
  }),
);

loansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const memberId = requireInt(body, "memberId", 1);
    const bookId = requireInt(body, "bookId", 1);
    const loan = await checkoutBook(memberId, bookId);
    res.status(201).json(loan);
  }),
);

loansRouter.post(
  "/:id/return",
  asyncHandler(async (req, res) => {
    const loan = await returnLoan(parseId(req.params.id));
    res.json(loan);
  }),
);
