import { createBrowserClient } from '@supabase/ssr';

/** Browser client for Supabase Auth, Realtime, and the family-scoped Data API. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error('Supabase is not configured. Add the public URL and publishable key to .env.local.');
  }

  return createBrowserClient(url, publishableKey);
}
