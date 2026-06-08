import { NextResponse } from "next/server";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = sanitizeRedirectPath(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("redirect", redirect);
      loginUrl.searchParams.set("error", "callback_failed");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
