import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const session = request.auth;

  if (pathname.startsWith("/admin")) {
    // TODO: Require a signed-in ADMIN role before allowing access.
    void session;
  }

  if (pathname.startsWith("/exam")) {
    // TODO: Require a signed-in user before allowing access.
    void session;
  }

  return NextResponse.next();
});

export const config = { matcher: ["/admin/:path*", "/exam/:path*"] };
