import type { NextFunction, Request, RequestHandler, Response } from "express";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Express 4 does NOT catch rejected promises from async handlers: without this wrapper an
// error thrown after an `await` becomes an unhandled rejection and the request never gets a
// response. (Express 5 does this for you.)
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
