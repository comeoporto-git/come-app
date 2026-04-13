import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import Script from "next/script";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "COME",
  description: "Porto Food Tours OS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "COME",
  },
};

export const viewport: Viewport = {
  themeColor: "#667470",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="pt" className={`${montserrat.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#EDE6DA] text-[#32373c]" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>
        <SessionProvider session={session}>{children}</SessionProvider>
        <Script id="register-sw" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
          }
        `}</Script>
      </body>
    </html>
  );
}
