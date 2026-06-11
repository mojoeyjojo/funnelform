import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supabase session refresh, Next 16 convention.
//
// IMPORTANT: in Next 16 the `middleware` file convention was renamed to `proxy`
// (there is no `middleware` doc shipped at all). The standard Supabase SSR
// quickstart says to put this in `middleware.ts` — in this project it MUST be
// `proxy.ts`. Same cookie API, runs on the Node.js runtime by default.
//
// Its only job is to read the session (triggering a token refresh when needed)
// and write the refreshed cookies back onto the response, so the browser stays
// logged in across navigations. Real authorization happens at the data layer
// (RLS + per-route getUser checks) — never rely on proxy alone (a matcher change
// can silently drop coverage).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the session early so a pending refresh is written before the response
  // is committed. getUser() (not getSession) verifies against the Auth server.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on pages, skip API routes (they create their own client), static
  // assets, and image optimization.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
