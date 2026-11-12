import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppDeps } from "./deps.js";
import { errorHandler } from "./http/middleware/errorHandler.js";
import { notFoundHandler } from "./http/middleware/notFound.js";
import { requestLogger } from "./http/middleware/requestLogger.js";
import { createApiRouter } from "./modules/api.router.js";
import { createHealthRouter } from "./modules/health/health.router.js";

// Builds the Express app from its dependencies. It never calls listen() and never reads
// the environment, so tests construct it with fakes and drive it with supertest.
// This file is the one place that shows the full middleware order.
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Middleware runs in registration order.
  app.use(requestLogger(deps.logger)); // first: everything after gets req.log and a request id
  app.use(helmet()); // security headers; also removes X-Powered-By
  app.use(cors({ origin: deps.config.webOrigin })); // allow the Next.js frontend only
  app.use(express.json({ limit: "100kb" })); // parse JSON bodies; cap the size

  // Feature routers. Each module owns its routes; app.ts only decides the URL prefix.
  app.use("/health", createHealthRouter(deps)); // public: probes carry no credentials
  app.use("/api", createApiRouter(deps)); // everything here requires a signed-in user

  app.use(notFoundHandler); // nothing matched
  app.use(errorHandler); // must be last

  return app;
}
