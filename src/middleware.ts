import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!jwtSecret || jwtSecret.length < 32)) {
	throw new Error("JWT_SECRET must be at least 32 characters in production");
}
const secret = new TextEncoder().encode(jwtSecret || "development-secret-change-me");

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const withRequestId = (response: NextResponse) => {
    response.headers.set("x-request-id", requestId);
    return response;
  };
  const token = request.cookies.get("booknest_token")?.value;
  const isStaffRoute = request.nextUrl.pathname.startsWith("/staff");
  const isProtected = request.nextUrl.pathname.startsWith("/account") || request.nextUrl.pathname.startsWith("/admin") || isStaffRoute;

  if (isProtected && !token) {
    return withRequestId(NextResponse.redirect(new URL(`/login?next=${request.nextUrl.pathname}`, request.url)));
  }

  if ((request.nextUrl.pathname.startsWith("/admin") || isStaffRoute) && token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (request.nextUrl.pathname.startsWith("/admin") && payload.role !== "ADMIN") {
        return withRequestId(NextResponse.redirect(new URL(payload.role === "LIBRARIAN" ? "/staff" : "/account", request.url)));
      }
      if (isStaffRoute && payload.role !== "ADMIN" && payload.role !== "LIBRARIAN") {
        return withRequestId(NextResponse.redirect(new URL("/account", request.url)));
      }
    } catch {
      return withRequestId(NextResponse.redirect(new URL("/login", request.url)));
    }
  }

  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = { matcher: ["/api/:path*", "/account/:path*", "/admin/:path*", "/staff/:path*"] };
