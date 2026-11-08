// Composition root: the only file that reads the environment, constructs real
// dependencies, wires them together, and has process-level side effects.
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./infra/db.js";
import { createLogger } from "./infra/logger.js";

function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (err) {
    // A readable message beats a stack trace for a config mistake.
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const logger = createLogger(config);
const prisma = createPrismaClient(config.databaseUrl);
const app = createApp({ config, logger, prisma });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, "codocs API listening");
});

// Graceful shutdown: on SIGTERM (what orchestrators send) or Ctrl+C, stop accepting new
// connections, let in-flight requests finish, close the DB, then exit. Without this,
// deploys cut requests off mid-response.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  // Safety net so a stuck connection can't block the process forever.
  setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();

  server.close((err) => {
    if (err) logger.error({ err }, "error closing HTTP server");
    prisma
      .$disconnect()
      .catch((e: unknown) => logger.error({ err: e }, "error closing database"))
      .finally(() => process.exit(err ? 1 : 0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A rejected promise nobody handled means the process is in an unknown state: log and exit
// and let the orchestrator restart it, rather than limping on.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  process.exit(1);
});
