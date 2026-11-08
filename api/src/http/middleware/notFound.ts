import type { RequestHandler } from "express";

// Reached only if no route ended the request. Register after all routers.
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
};
