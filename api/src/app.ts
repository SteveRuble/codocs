import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import { config } from "./config.js";

// The app is built by a factory function, separate from server.ts which calls
// listen(). That split lets tests import the app without opening a port.
export function createApp(): Express {
  const app = express();

  // --- Middleware: runs top-to-bottom for every request, in registration order ---
  app.use(cors({ origin: config.webOrigin })); // lets the Next.js app call us from the browser
  app.use(express.json()); // parses JSON bodies into req.body

  // --- Routes ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // --- 404: reached only if no route above ended the request ---
  app.use((req, res) => {
    res.status(404).json({
      error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
    });
  });

  // --- Error handler: Express recognises it by its 4 arguments. Must be LAST. ---
  // Express 5 forwards rejected promises / thrown errors from async handlers here.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
      error: { code: "internal_error", message: "Something went wrong" },
    });
  };
  app.use(errorHandler);

  return app;
}
