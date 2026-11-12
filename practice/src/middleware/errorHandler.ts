import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Malformed JSON bodies arrive here with a 400 status from express.json().
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: "Bad request" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
