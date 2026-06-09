const DEFAULT_MODULE_BASE_PATH = "/manufacturing/kitanagoya";
const DEFAULT_API_BASE_PATH = "/api/kitanagoya";

function normalizeBasePath(value: string | undefined, fallback: string) {
  const raw = (value ?? fallback).trim();
  if (!raw || raw === "/") return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function splitSuffix(path: string) {
  const match = path.match(/^([^?#]*)(.*)$/);
  return {
    pathname: match?.[1] ?? path,
    suffix: match?.[2] ?? "",
  };
}

function joinBasePath(basePath: string, path: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`))) {
    return path;
  }

  const { pathname, suffix } = splitSuffix(path || "/");
  const normalizedPathname =
    !pathname || pathname === "/" ? "" : pathname.startsWith("/") ? pathname : `/${pathname}`;
  const joined = `${basePath}${normalizedPathname}${suffix}`;

  return joined || "/";
}

export const KITAGOYA_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_KITAGOYA_BASE_PATH,
  DEFAULT_MODULE_BASE_PATH,
);

export const KITAGOYA_API_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_KITAGOYA_API_BASE_PATH,
  DEFAULT_API_BASE_PATH,
);

export function kitagoyaPath(path = "/") {
  return joinBasePath(KITAGOYA_BASE_PATH, path);
}

export function kitagoyaApiPath(path: string) {
  const withoutApiPrefix =
    path === "/api" ? "/" : path.startsWith("/api/") ? path.slice("/api".length) : path;
  return joinBasePath(KITAGOYA_API_BASE_PATH, withoutApiPrefix);
}

export function stripKitagoyaBasePath(pathname: string) {
  if (!KITAGOYA_BASE_PATH) return pathname || "/";
  if (pathname === KITAGOYA_BASE_PATH) return "/";
  if (pathname.startsWith(`${KITAGOYA_BASE_PATH}/`)) {
    return pathname.slice(KITAGOYA_BASE_PATH.length) || "/";
  }
  return pathname || "/";
}
