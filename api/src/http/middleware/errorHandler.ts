import type { ErrorRequestHandler } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { toHttpError } from "../errorMapping.js";

// The ONLY place an error response is written. Express identifies error handlers by their
// four parameters; all four must be declared even if unused. Must be registered last.
// Express 5 routes thrown errors and rejected promises from async handlers here, so
// route code just throws; no try/catch/next(err) boilerplate and no asyncHandler wrapper
// (Express 4 needed one, and old tutorials still show it).
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // If a response is already partially sent we can't change it; defer to Express's
  // default handler, which closes the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = String(req.id);
  const httpError = toHttpError(err);

  if (httpError && httpError.status < 500) {
    // Client errors are the client's problem, not ours: debug level only (the access log
    // already records the status). We log the classification, NOT the error object:
    // body-parser errors carry the raw request body, which may hold credentials.
    // Exception: a Prisma error reaching here means a service skipped a check; surface it.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      req.log.warn({ code: httpError.code, prismaCode: err.code }, "database error mapped to client error");
    } else if (!(err instanceof HttpError)) {
      req.log.debug({ code: httpError.code }, "client error");
    } else {
      req.log.debug({ code: httpError.code }, "request rejected");
    }
    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details ? { details: httpError.details } : {}),
        requestId,
      },
    });
    return;
  }

  // 5xx (a bug, an outage, or an HttpError we threw with a 5xx status): log everything,
  // tell the client nothing but a request id they can quote to us.
  req.log.error({ err: httpError?.cause ?? err }, "unhandled error");
  res.status(httpError?.status ?? 500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong",
      requestId,
    },
  });
};
