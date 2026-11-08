import { HttpError, httpErrors } from "./errors.js";
import { Prisma } from "../generated/prisma/client.js";

// Translates "something was thrown" into an HttpError, or undefined if it is a bug.
// A pure function with no req/res, so it is trivially unit-testable.
//
// Priority: what we threw on purpose > what libraries throw in known ways > everything
// else is a 500. Messages are written here, never copied from the source error: library
// messages can contain SQL, file paths, or request content.
export function toHttpError(err: unknown): HttpError | undefined {
  if (err instanceof HttpError) return err;

  // Express's own body-parser (express.json) errors carry an HTTP `status` and a `type`.
  if (typeof err === "object" && err !== null) {
    const { type, status } = err as { type?: unknown; status?: unknown };
    if (type === "entity.parse.failed") {
      return new HttpError(400, "invalid_json", "Request body is not valid JSON", { cause: err });
    }
    if (type === "entity.too.large") {
      return new HttpError(413, "payload_too_large", "Request body is too large", { cause: err });
    }
    if (typeof status === "number" && status >= 400 && status < 500) {
      return new HttpError(status, "bad_request", "Bad request", { cause: err });
    }
  }

  // Database errors. Services should check expected conditions and throw their own
  // HttpError; these mappings are the SAFETY NET for races the check can't see (two
  // requests inserting the same unique value at once) and for oversights.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025": // record required by the operation does not exist
        return Object.assign(httpErrors.notFound(), { cause: err });
      case "P2002": // unique constraint failed
        return Object.assign(httpErrors.conflict("A resource with these values already exists"), { cause: err });
      case "P2003": // foreign key constraint failed (bad reference, or delete blocked by Restrict)
        return Object.assign(httpErrors.conflict("The operation conflicts with related data"), { cause: err });
    }
  }

  return undefined;
}
