import type { AppDeps } from "../../deps.js";
import type { User } from "../../generated/prisma/client.js";

// What we learn about a person from a verified sign-in token.
export interface GitHubProfile {
  githubId: string;
  login: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

// A service holds business logic and talks to the database. It knows nothing about
// req/res/HTTP: it takes plain values and returns plain values or throws. That is what
// lets the same logic be called from a router, a script, or a test.
export function createUserService({ prisma }: Pick<AppDeps, "prisma">) {
  return {
    /**
     * Find the local User for a GitHub account, creating or refreshing it as needed.
     * Called on every authenticated request, so the common case (row exists and is
     * current) must be a single read with NO write.
     */
    async upsertFromGitHub(profile: GitHubProfile): Promise<User> {
      const existing = await prisma.user.findUnique({ where: { githubId: profile.githubId } });
      if (
        existing &&
        existing.login === profile.login &&
        existing.name === profile.name &&
        existing.email === profile.email &&
        existing.image === profile.image
      ) {
        return existing;
      }

      // `upsert` is one atomic operation, so two first-ever requests from the same person
      // arriving together can't both try to insert and trip the unique constraint.
      return prisma.user.upsert({
        where: { githubId: profile.githubId },
        create: profile,
        update: { login: profile.login, name: profile.name, email: profile.email, image: profile.image },
      });
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
