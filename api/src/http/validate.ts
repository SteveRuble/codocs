import type { Request } from "express";
import type { z } from "zod";
import { httpErrors, type ValidationIssue } from "./errors.js";

// TypeScript types vanish at runtime, so `req.body as CreateComment` checks NOTHING: it
// just tells the compiler to trust bytes that came off the network. The boundary needs a
// runtime check, and Zod gives us both: it validates, and the schema's output type is
// what the rest of the code sees. That is the Go equivalent of decoding into a struct
// AND running a validator, except the struct type is derived from the validator.
type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

// For each source you supplied a schema for, the parsed (and possibly transformed) value.
type Parsed<S extends Schemas> = { [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never };

/**
 * Validate any combination of req.params / req.query / req.body.
 *
 *   const { params, body } = validateRequest(req, { params: idParams, body: createComment });
 *
 * Throws one 400 `validation_failed` listing EVERY problem across all three parts, so
 * a client fixing a bad request sees all errors at once, not one per round trip.
 *
 * We return the parsed values instead of overwriting req.body/req.query: in Express 5
 * `req.query` is a read-only getter, and mutating the request hides what is validated.
 */
export function validateRequest<S extends Schemas>(req: Request, schemas: S): Parsed<S> {
  const parsed: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];

  for (const source of ["params", "query", "body"] as const) {
    const schema = schemas[source];
    if (!schema) continue;
    const result = schema.safeParse(req[source]);
    if (result.success) {
      parsed[source] = result.data;
    } else {
      for (const issue of result.error.issues) {
        issues.push({ source, path: issue.path.join("."), message: issue.message });
      }
    }
  }

  if (issues.length > 0) throw httpErrors.validation(issues);
  return parsed as Parsed<S>;
}
