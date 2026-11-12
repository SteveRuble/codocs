import { Router } from "express";
import { prisma } from "../prisma";
import { AppError, asyncHandler } from "../errors";
import { parseId } from "../lib/parse";

export const membersRouter = Router();

// GET /members/:id/loans?active=true
membersRouter.get(
  "/:id/loans",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const member = await prisma.member.findUnique({ where: { id } });
    if (!member) throw new AppError(404, "Member not found");

    const loans = await prisma.loan.findMany({
      where: {
        memberId: id,
        // `null` means "IS NULL". (`undefined` would mean "no filter at all": see the drills.)
        ...(req.query.active === "true" ? { returnedAt: null } : {}),
      },
      include: { book: { select: { id: true, title: true } } },
      orderBy: { loanedAt: "desc" },
    });
    res.json(loans);
  }),
);
