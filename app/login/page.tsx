'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non riesco a inviare il link. Riprova tra poco.');
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
        <p>Abbiamo inviato un link di accesso a <strong>{email}</strong>. Aprilo da questo dispositivo per entrare.</p>
        <button className="outline-btn" onClick={() => setSent(false)}>Usa un altro indirizzo</button>
      </div> : <>
        <div className="eyebrow">LA SPESA, INSIEME</div>
        <h1>Accedi a GiroSpesa</h1>
        <p className="auth-intro">Ti mandiamo un link sicuro via email. Non serve ricordare una password.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">La tua email</label>
          <input id="email" type="email" autoComplete="email" required placeholder="nome@email.it" value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-btn" disabled={busy}>{busy ? 'Invio…' : 'Mandami il link di accesso'}</button>
        </form>
        <p className="auth-privacy">Il link scade dopo un breve periodo e vale una sola volta.</p>
      </>}
    </section>
  </main>;
}
