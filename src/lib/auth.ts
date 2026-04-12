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
      if (user?.email) {
        const member = await getTeamMemberByEmail(user.email);
        if (member) {
          token.role = member.role;
          token.notionId = member.id;
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
