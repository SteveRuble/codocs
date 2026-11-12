import type { Request } from "express";
import type { User } from "../../generated/prisma/client.js";
import "./auth.types.js"; // pulls in the `req.user` type augmentation

/**
 * The authenticated user for this request. Use this in handlers instead of `req.user`, so
 * you get a non-optional User without scattering `req.user!` or `if (!req.user)` checks.
 *
 * If it throws, that's a PROGRAMMING error (a route was mounted without `authenticate`),
 * not a client error, so it's a plain Error and becomes a 500 rather than a 401. Failing
 * closed is the point: a forgotten middleware must never look like "no user, carry on".
 */
export function currentUser(req: Request): User {
  if (!req.user) {
    throw new Error("currentUser() called on a route that is not behind the authenticate middleware");
  }
  return req.user;
}
