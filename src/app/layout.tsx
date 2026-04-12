import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "COME",
  description: "Porto Food Tours OS",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="pt" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#f5f4f1] text-[#32373c]" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
