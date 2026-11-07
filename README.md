# GiroSpesa

Lista della spesa condivisa per la famiglia (Next.js + Supabase).

## Accesso: solo account autorizzati

L'app non permette registrazioni: possono entrare solo gli account creati a mano in Supabase.

Configurazione nel pannello Supabase:

1. **Authentication → Sign In / Providers**: disattiva *Allow new users to sign up*.
2. **Authentication → Users → Add user → Create new user**: email + password, con
   *Auto Confirm User* attivo, per ogni persona che deve accedere. Si entra con email e password;
   il link via email resta come alternativa ("Password dimenticata?").
3. **Authentication → URL Configuration**
   - *Site URL*: l'indirizzo di produzione (es. `https://girospesa.vercel.app`).
   - *Redirect URLs*: `https://girospesa.vercel.app/**` e `http://localhost:3000/**`.
4. **Authentication → Emails → Magic Link**: nel template sostituisci il link con
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   così il link funziona anche aperto da un altro dispositivo o dall'app della posta.

## Aggiungere un familiare alla famiglia

Il primo utente crea la famiglia dall'app. Per far entrare un altro utente nella stessa
famiglia, **prima** che faccia il suo primo accesso, esegui nell'SQL editor di Supabase:

```sql
insert into public.family_members (family_id, user_id, role)
select fm.family_id, u.id, 'member'
from public.family_members fm
join auth.users owner on owner.id = fm.user_id and owner.email = 'tua@email.it'
cross join auth.users u
where u.email = 'familiare@email.it';
```
