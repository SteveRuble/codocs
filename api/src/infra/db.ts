import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";

// A factory instead of an exported singleton: the caller decides when the connection
// is created and (via prisma.$disconnect()) when it is closed. One client per process;
// each owns a connection pool, so never create one per request.
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}
