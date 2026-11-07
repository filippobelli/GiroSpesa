import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Supabase sends errors (e.g. expired link) back as query params instead of a code.
  if (searchParams.get('error_code') === 'otp_expired') {
    return NextResponse.redirect(new URL('/login?error=expired', origin));
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', origin));
}
