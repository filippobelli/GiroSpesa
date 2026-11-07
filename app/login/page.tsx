'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const LINK_ERRORS: Record<string, string> = {
  link: 'Il link non è valido o è già stato usato. Accedi con la password o chiedine uno nuovo.',
  expired: 'Il link è scaduto. Accedi con la password o chiedine uno nuovo.',
};

function friendlyError(caught: unknown) {
  const code = typeof caught === 'object' && caught && 'code' in caught ? String((caught as { code?: unknown }).code) : '';
  const message = caught instanceof Error ? caught.message : '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Email o password non corretti.';
  }
  // With sign-ups disabled, Supabase refuses OTP for addresses that have no account.
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return 'Questa email non è abilitata ad accedere a GiroSpesa.';
  }
  if (code === 'email_not_confirmed') {
    return 'Questo account non è ancora confermato.';
  }
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return 'Troppi tentativi in poco tempo. Riprova tra qualche minuto.';
  }
  return message || 'Non riesco ad accedere. Riprova tra poco.';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    if (reason) setError(LINK_ERRORS[reason] ?? LINK_ERRORS.link);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      window.location.replace('/');
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  }

  async function sendLink() {
    if (!email.trim()) {
      setError('Scrivi prima la tua email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Only the accounts created by hand in Supabase may sign in: no self-registration.
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <a className="brand auth-brand" href="/"><span className="brand-mark">g</span><span>giro<span>spesa</span></span></a>
      {sent ? <div className="auth-message">
        <div className="auth-symbol">✉</div>
        <h1>Controlla la posta</h1>
        <p>Abbiamo inviato un link di accesso a <strong>{email}</strong>. Aprilo per entrare.</p>
        <button className="outline-btn" onClick={() => setSent(false)}>Torna all&apos;accesso</button>
      </div> : <>
        <div className="eyebrow">LA SPESA, INSIEME</div>
        <h1>Accedi a GiroSpesa</h1>
        <p className="auth-intro">Entra con l&apos;account della famiglia.</p>
        <form onSubmit={signIn} className="auth-form">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required placeholder="nome@email.it" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-btn" disabled={busy}>{busy ? 'Accesso…' : 'Accedi'}</button>
        </form>
        <button type="button" className="auth-signout" disabled={busy} onClick={() => void sendLink()}>Password dimenticata? Mandami un link via email</button>
      </>}
    </section>
  </main>;
}
