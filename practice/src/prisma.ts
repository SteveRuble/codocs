import { PrismaClient } from "@prisma/client";

// One client for the whole process (it owns the connection pool).
// Set PRISMA_LOG=query to print every SQL statement: the fastest way to see what Prisma is doing.
export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
});
