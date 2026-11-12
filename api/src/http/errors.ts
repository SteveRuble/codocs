// The error vocabulary of the HTTP layer. Services and routers THROW these; the error
// handler (http/middleware/errorHandler.ts) turns them into responses. Nothing else
// writes an error response by hand, so every failure has the same shape.

// A closed set of machine-readable codes the frontend can switch on. A union type
// (not an enum) is the idiomatic TS way: no runtime object, exhaustiveness checking.
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "invalid_json"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "payload_too_large"
  | "internal_error";

export interface ValidationIssue {
  /** Which part of the request: params, query or body. */
  source: "params" | "query" | "body";
  /** Dotted path inside that part, e.g. "startLine". Empty when the whole part is invalid. */
  path: string;
  message: string;
}

// An error whose message is SAFE TO SHOW THE CLIENT. That is the rule that defines this
// class: never put internal details, SQL, or user-supplied secrets in `message`. Anything
// that isn't an HttpError (after mapping) is treated as a bug and reported as a generic 500.
//
// Fields are declared explicitly rather than as constructor parameter properties, so the
// file stays valid under `erasableSyntaxOnly` / Node's native type stripping.
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: readonly ValidationIssue[] | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { details?: readonly ValidationIssue[]; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
  }
}

// Named constructors read better at call sites than remembering status/code pairs:
//   throw httpErrors.notFound("Document");
export const httpErrors = {
  badRequest: (message: string) => new HttpError(400, "bad_request", message),
  validation: (details: readonly ValidationIssue[]) =>
    new HttpError(400, "validation_failed", "Request validation failed", { details }),
  // `cause` keeps the real reason (bad signature? expired?) for our logs without telling the client.
  unauthorized: (message = "Authentication required", cause?: unknown) =>
    new HttpError(401, "unauthorized", message, { cause }),
  forbidden: (message = "You do not have access to this resource") => new HttpError(403, "forbidden", message),
  notFound: (resource = "Resource") => new HttpError(404, "not_found", `${resource} not found`),
  conflict: (message: string) => new HttpError(409, "conflict", message),
  // For well-formed requests that break a business rule (e.g. a comment past the last line).
  unprocessable: (message: string) => new HttpError(422, "unprocessable", message),
} as const;
