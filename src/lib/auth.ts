import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import PgAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import { getTeamMemberByEmail } from "@/lib/notion";
import { getDb } from "@/lib/db";
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
      googleAccessToken?: string;
    };
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
          access_type: "offline",
        },
      },
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@comeoporto.com",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const member = await getTeamMemberByEmail(user.email);
      // Block anyone not in the Notion Team DB
      return member !== null;
    },
    async jwt({ token, user, account }) {
      // On every Google OAuth sign-in, capture the fresh token in the JWT
      // AND force-update the accounts table so the DB fallback stays in sync.
      if (account?.provider === "google" && account.access_token) {
        token.googleAccessToken = account.access_token;
        try {
          const sql = getDb();
          await sql`
            UPDATE accounts
            SET access_token  = ${account.access_token},
                refresh_token = COALESCE(${account.refresh_token ?? null}, refresh_token),
                expires_at    = ${account.expires_at ?? null}
            WHERE provider = 'google'
              AND "providerAccountId" = ${account.providerAccountId}
          `;
        } catch { /* never fail auth over a token cache update */ }
      }

      const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes — matches getTeamMemberByEmail's own cache revalidation window
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
        session.user.googleAccessToken = token.googleAccessToken as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login?verify=1",
  },
});
