import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Public routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/preview")
  ) {
    return NextResponse.next();
  }

  // Not logged in
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = session.user?.role;

  // Role-based access control
  if (pathname.startsWith("/guide") && role !== "Guide" && role !== "Super Guide" && role !== "Admin") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
  if (
    pathname.startsWith("/accountant") &&
    role !== "Accountant" &&
    role !== "Admin"
  ) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
  if (pathname.startsWith("/super-guide") && role !== "Super Guide" && role !== "Admin") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
  if (pathname.startsWith("/admin") && role !== "Admin") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
