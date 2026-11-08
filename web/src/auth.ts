import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session {
    user: {
      githubId: string;
      login: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.githubId = String(profile.id);
        token.login = String((profile as { login?: string }).login ?? "");
      }
      return token;
    },
    session({ session, token }) {
      session.user.githubId = (token.githubId as string | undefined) ?? token.sub ?? "";
      session.user.login = (token.login as string | undefined) ?? "";
      return session;
    },
  },
});
