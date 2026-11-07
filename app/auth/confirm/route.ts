import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Token-hash login: works from any device or mail app, because it does not need the
 * PKCE verifier cookie stored in the browser that requested the link.
 * Email templates in Supabase must point here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destination, origin));
    const reason = error.code === 'otp_expired' ? 'expired' : 'link';
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', origin));
}
