import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const PROTECTED_PATHS = ["/dashboard", "/host/link", "/chat"] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

function isE2eAuthBypass(request: NextRequest): boolean {
  return (
    process.env.E2E_AUTH_BYPASS === "1" &&
    request.cookies.get("e2e-test-auth")?.value === "1"
  );
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const e2eBypass = isE2eAuthBypass(request);

  const env = getSupabasePublicEnv();
  if (!env) {
    if (isProtectedPath(pathname) && !e2eBypass) {
      return redirectToLogin(request, pathname);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Réseau ou session invalide : traiter comme déconnecté sans faire échouer la requête.
  }

  if (isProtectedPath(pathname) && !user && !e2eBypass) {
    return redirectToLogin(request, pathname);
  }

  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = sanitizeRedirectPath(url.searchParams.get("redirect"));
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
