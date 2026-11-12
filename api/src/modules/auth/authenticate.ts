import type { RequestHandler } from "express";
import { httpErrors } from "../../http/errors.js";
import type { UserService } from "../users/users.service.js";
import type { TokenVerifier } from "./token.js";
import "./auth.types.js";

// RFC 6750: "Authorization: Bearer <token>". The scheme name is case-insensitive.
const BEARER = /^Bearer\s+(\S+)$/i;

interface AuthenticateDeps {
  verifier: TokenVerifier;
  users: UserService;
}

/**
 * Authentication middleware. It answers "who is calling?" (not "may they do this?", which is
 * authorization and lives with each feature). On success it sets `req.user`; on failure it
 * throws a 401 and the request never reaches the route.
 *
 * Middleware is a function of (req, res, next). Express 5 awaits async middleware, so a
 * rejection or throw goes to the error handler without any try/catch here. Express 4 would
 * hang the request on an unhandled rejection.
 */
export function createAuthenticate({ verifier, users }: AuthenticateDeps): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? "");
    if (!match?.[1]) {
      throw httpErrors.unauthorized("Authentication required");
    }

    const profile = await verifier.verify(match[1]); // throws 401 if invalid
    const user = await users.upsertFromGitHub(profile);

    req.user = user;
    // From here on, every log line for this request carries the user's id.
    req.log = req.log.child({ userId: user.id });
    next();
  };
}
