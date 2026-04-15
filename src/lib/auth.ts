import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getTeamMemberByEmail } from "@/lib/notion";
import type { TeamMember } from "@/lib/notion";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: TeamMember["role"];
      notionId: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const member = await getTeamMemberByEmail(user.email);
      // Block anyone not in the Notion Team DB
      return member !== null;
    },
    async jwt({ token, user }) {
      const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
      const now = Date.now();
      const shouldRefresh =
        user?.email || // always refresh on sign-in
        !token.roleUpdatedAt ||
        now - (token.roleUpdatedAt as number) > REFRESH_INTERVAL;

      if (shouldRefresh) {
        const email = (user?.email ?? token.email) as string | undefined;
        if (email) {
          const member = await getTeamMemberByEmail(email);
          if (member) {
            token.role = member.role;
            token.notionId = member.id;
            token.roleUpdatedAt = now;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as TeamMember["role"];
        session.user.notionId = token.notionId as string;
        session.user.id = token.sub ?? "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
