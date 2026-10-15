import { useState, type FormEvent } from 'react';
import { authErrorInUrl, supabase } from '../data/supabase';
import { errorMessage } from '../data/store';
import { translateAuthError } from '../lib/authErrors';
import { attributionMetadata, readAttribution } from '../lib/utm';

type Mode = 'signup' | 'signin' | 'forgot';

const MIN_PASSWORD = 8;

/**
 * Deux onglets : « Créer un compte » (e-mail, mot de passe, confirmation) et « Se connecter » (e-mail, mot de passe).
 * Après l'inscription, Supabase envoie un lien de confirmation : on l'explique clairement avec la possibilité de le renvoyer.
 */
export function AuthScreen() {
  // Retour d'un lien d'e-mail périmé (déjà utilisé, trop ancien) : on l'explique et on propose de se connecter.
  const [mode, setMode] = useState<Mode>(authErrorInUrl ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    authErrorInUrl ? 'Ce lien a expiré ou a déjà été utilisé. Connectez-vous, ou refaites la demande.' : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  /** Adresse en attente de confirmation (affiche l'écran « vérifiez vos e-mails »). */
  const [pending, setPending] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setConfirm('');
    setError(null);
    setInfo(null);
  };

  /** Exécute une action d'authentification avec état « en cours » et message d'erreur lisible. */
  const run = async (action: () => Promise<void>) => {
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      const raw = errorMessage(err);
      if (raw.toLowerCase().includes('email not confirmed')) setPending(email.trim());
      setError(translateAuthError(raw));
    } finally {
      setBusy(false);
    }
  };

  // Le lien de confirmation ramène directement dans l'app (si l'adresse est autorisée dans Supabase).
  const redirectTo = () => `${window.location.origin}/?app`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'forgot') {
      return void run(async () => {
        if (!supabase) return;
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
        if (err) throw err;
        setInfo(`Si un compte existe pour ${email.trim()}, un e-mail vient d'être envoyé : cliquez sur le lien pour choisir un nouveau mot de passe.`);
      });
    }
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD) return setError(`Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
      if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    }
    void run(async () => {
      if (!supabase) return;
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        return; // La session est reprise par App via onAuthStateChange.
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo(), data: attributionMetadata(readAttribution()) },
      });
      if (err) throw err;
      if (data.session) return;
      // Adresse déjà inscrite : Supabase ne renvoie ni erreur ni e-mail, mais un utilisateur sans identité.
      if (data.user && data.user.identities?.length === 0) {
        setMode('signin');
        setConfirm('');
        setInfo('Un compte existe déjà avec cet e-mail : connectez-vous avec votre mot de passe.');
        return;
      }
      // Sinon, Supabase attend la confirmation de l'adresse.
      setPending(email.trim());
    });
  };

  const resend = () =>
    void run(async () => {
      if (!supabase || !pending) return;
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: pending, options: { emailRedirectTo: redirectTo() } });
      if (err) throw err;
      setInfo('E-mail renvoyé.');
    });

  const confirmedNowSignIn = () => {
    setPending(null);
    setMode('signin');
    setConfirm('');
    setError(null);
    setInfo(null);
  };

  if (pending) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1 className="logo">Dollo</h1>
          <h2 className="auth-title">Dernière étape : confirmez votre adresse</h2>
          <p className="tagline">
            Nous avons envoyé un e-mail à <strong>{pending}</strong>. Ouvrez-le et cliquez sur le lien : votre compte sera activé. Pensez à regarder dans les
            courriers indésirables.
          </p>
          <Messages error={error} info={info} />
          <button type="button" className="btn primary block" onClick={confirmedNowSignIn}>
            C'est fait, je me connecte
          </button>
          <button type="button" className="link-btn" disabled={busy} onClick={resend}>
            Je n'ai rien reçu : renvoyer l'e-mail
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">Dollo</h1>
        <p className="tagline">Tétées, couches, siestes. Notés en un geste, partagés entre parents.</p>

        <div className="segmented auth-tabs" role="group" aria-label="Compte">
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>
            Créer un compte
          </button>
          <button type="button" aria-pressed={mode !== 'signup'} onClick={() => switchMode('signin')}>
            Se connecter
          </button>
        </div>

        {mode === 'forgot' && (
          <p className="hint">Saisissez votre e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
        )}
        <form onSubmit={submit}>
          <label className="field">
            <span className="label">E-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span className="label">Mot de passe</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'signup' && <span className="hint">{MIN_PASSWORD} caractères minimum.</span>}
            </label>
          )}
          {mode === 'signup' && (
            <label className="field">
              <span className="label">Confirmer le mot de passe</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          <Messages error={error} info={info} />
          <button type="submit" className="btn primary block" disabled={busy}>
            {mode === 'signup' ? 'Créer mon compte' : mode === 'signin' ? 'Se connecter' : 'Recevoir le lien'}
          </button>
        </form>
        {mode === 'signin' && (
          <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
            Mot de passe oublié ?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
            Retour à la connexion
          </button>
        )}
      </div>
    </main>
  );
}

/** Après le lien « mot de passe oublié » : l'utilisateur est connecté, il choisit son nouveau mot de passe. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    if (!supabase) return;
    setError(null);
    setBusy(true);
    void supabase.auth
      .updateUser({ password })
      .then(({ error: err }) => {
        if (err) throw err;
        onDone();
      })
      .catch((err) => setError(translateAuthError(errorMessage(err))))
      .finally(() => setBusy(false));
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">Dollo</h1>
        <h2 className="auth-title">Choisissez un nouveau mot de passe</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span className="label">Nouveau mot de passe</span>
            <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">{MIN_PASSWORD} caractères minimum.</span>
          </label>
          <label className="field">
            <span className="label">Confirmer le mot de passe</span>
            <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <Messages error={error} info={null} />
          <button type="submit" className="btn primary block" disabled={busy}>
            Enregistrer et continuer
          </button>
        </form>
      </div>
    </main>
  );
}

function Messages({ error, info }: { error: string | null; info: string | null }) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {info && <p className="form-info">{info}</p>}
    </>
  );
}
