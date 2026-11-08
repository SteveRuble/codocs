import type { ErrorRequestHandler } from "express";

// Errors raised by Express's own middleware (body-parser) carry an HTTP status and a
// `type`. We map the ones we expect to stable codes and never echo err.message to the
// client: internals and user-supplied content must not leak into responses.
// Step 005 adds our own HttpError type to this function.
const KNOWN_CLIENT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  "entity.parse.failed": { status: 400, code: "invalid_json", message: "Request body is not valid JSON" },
  "entity.too.large": { status: 413, code: "payload_too_large", message: "Request body is too large" },
};

function bodyParserError(err: unknown): { status: number; code: string; message: string } | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { type, status } = err as { type?: unknown; status?: unknown };
  if (typeof type === "string" && type in KNOWN_CLIENT_ERRORS) return KNOWN_CLIENT_ERRORS[type];
  if (typeof status === "number" && status >= 400 && status < 500) {
    return { status, code: "bad_request", message: "Bad request" };
  }
  return undefined;
}

// Express identifies error handlers by their four parameters; all four must be declared
// even if unused. Must be registered last. Express 5 routes thrown errors and rejected
// promises from async handlers here.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // If a response is already partially sent we can't change it; defer to Express's
  // default handler, which closes the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const clientError = bodyParserError(err);
  if (clientError) {
    // Log the classification only: body-parser errors carry the raw request body, which
    // may contain credentials. The access log already records the 4xx status.
    req.log.debug({ code: clientError.code }, "client error");
    res.status(clientError.status).json({ error: { code: clientError.code, message: clientError.message } });
    return;
  }

  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
