import type { Config } from "./config.js";
import type { Logger } from "./infra/logger.js";
import type { PrismaClient } from "./generated/prisma/client.js";

// Everything the application needs from the outside world. Built once in server.ts
// (the composition root, like main() in Go) and passed down explicitly. Nothing
// imports a global singleton, so tests can substitute any of these.
export interface AppDeps {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
}
