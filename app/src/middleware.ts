import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/shift-entry", "/api/shift-entry"];

export function middleware(req: NextRequest) {
  const adminUser = process.env.KITAGOYA_ADMIN_BASIC_USER;
  const adminPassword = process.env.KITAGOYA_ADMIN_BASIC_PASSWORD;
  if (!adminUser || !adminPassword) return NextResponse.next();

  const pathname = stripKitagoyaBasePath(req.nextUrl.pathname);
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const authorization = req.headers.get("authorization");
  if (isValidBasicAuth(authorization, adminUser, adminPassword)) return NextResponse.next();

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Kitagoya Admin"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function isValidBasicAuth(authorization: string | null, user: string, password: string) {
  if (!authorization?.startsWith("Basic ")) return false;
  const decoded = atob(authorization.slice("Basic ".length));
  return decoded === `${user}:${password}`;
}

function stripKitagoyaBasePath(pathname: string) {
  const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_KITAGOYA_BASE_PATH);
  if (!basePath) return pathname || "/";
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname || "/";
}

function normalizeBasePath(value: string | undefined) {
  const raw = (value ?? "/manufacturing/kitanagoya").trim();
  if (!raw || raw === "/") return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
