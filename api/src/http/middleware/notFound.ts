import type { RequestHandler } from "express";
import { HttpError } from "../errors.js";

// Reached only if no route ended the request. Register after all routers. It raises an
// error instead of writing a response so that the error handler stays the single place
// where error bodies are produced.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "not_found", `No route for ${req.method} ${req.path}`));
};
