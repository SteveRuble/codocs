import { jwtVerify } from "jose";
import { z } from "zod";
import type { Config } from "../../config.js";
import { httpErrors } from "../../http/errors.js";
import type { GitHubProfile } from "../users/users.service.js";

// The Next.js app signs tokens with these; keep them in sync with
// web/src/app/api/token/route.ts. Checking issuer and audience means a token that was
// minted for some other purpose with the same secret is not accepted here.
export const JWT_ISSUER = "codocs-web";
export const JWT_AUDIENCE = "codocs-api";

// A valid SIGNATURE only proves who signed it, not that the payload has the shape we
// expect, so the claims are validated like any other untrusted input.
const claimsSchema = z.object({
  sub: z.string().min(1), // GitHub's numeric account id, as a string
  login: z.string().min(1),
  name: z.string().nullish(),
  email: z.string().nullish(),
  picture: z.string().nullish(),
});

export function createTokenVerifier({ jwtSecret }: Pick<Config, "jwtSecret">) {
  // The frontend signs with the secret's UTF-8 bytes (TextEncoder), so we must import it
  // the same way. A mismatch here shows up as "signature verification failed" for every token.
  const key = new TextEncoder().encode(jwtSecret);

  return {
    /** Returns the verified identity, or throws a 401 HttpError. Never returns unverified data. */
    async verify(token: string): Promise<GitHubProfile> {
      try {
        const { payload } = await jwtVerify(token, key, {
          // PIN the algorithm. Without this, a library may accept whatever the token's own
          // header claims, which is the root of the classic "alg: none" and RS/HS-confusion attacks.
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          requiredClaims: ["sub", "exp"], // a token that never expires is rejected
          clockTolerance: 5, // seconds of skew between the two servers' clocks
        });
        const claims = claimsSchema.parse(payload);
        return {
          githubId: claims.sub,
          login: claims.login,
          name: claims.name ?? null,
          email: claims.email ?? null,
          image: claims.picture ?? null,
        };
      } catch (err) {
        // One generic message for every failure (bad signature, expired, wrong audience,
        // malformed): telling an attacker WHICH check failed only helps them. The real
        // reason travels in `cause` and is logged at debug level by the error handler.
        throw httpErrors.unauthorized("Invalid or expired token", err);
      }
    },
  };
}

export type TokenVerifier = ReturnType<typeof createTokenVerifier>;
