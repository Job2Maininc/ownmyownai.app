const DEFAULT_REDIRECT = "/dashboard";

export function sanitizeRedirectPath(
  path: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }
  return path;
}
