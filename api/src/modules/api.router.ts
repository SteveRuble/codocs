import { Router } from "express";
import type { AppDeps } from "../deps.js";
import { createAuthenticate } from "./auth/authenticate.js";
import { createTokenVerifier } from "./auth/token.js";
import { createMeRouter } from "./users/me.router.js";
import { createUserService } from "./users/users.service.js";

// Everything under /api requires a signed-in user. Authentication is applied ONCE, at the
// top of this router, so a feature router can't forget it: adding a route here is
// protected by default. (Public routes, like /health, are mounted outside this router.)
export function createApiRouter(deps: AppDeps): Router {
  const users = createUserService(deps);
  const authenticate = createAuthenticate({ verifier: createTokenVerifier(deps.config), users });

  const api = Router();
  api.use(authenticate);

  api.use("/me", createMeRouter());
  // documents and comments routers are added in steps 007-009.

  return api;
}
