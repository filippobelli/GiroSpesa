import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // If Supabase falls back to the Site URL (redirect not allow-listed), the login code
  // lands on "/" and would be dropped by the login redirect below: forward it instead.
  const path = request.nextUrl.pathname;
  if (!path.startsWith('/auth/')) {
    const params = request.nextUrl.searchParams;
    const target = params.has('token_hash') ? '/auth/confirm'
      : params.has('code') || params.has('error_code') ? '/auth/callback'
      : null;
    if (target) {
      const forward = request.nextUrl.clone();
      forward.pathname = target;
      return NextResponse.redirect(forward);
    }
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const publicRoute = path === '/login' || path.startsWith('/auth/');

  if (!user && !publicRoute) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  if (user && path === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
