import { useState, type FormEvent } from 'react';
import { supabase } from '../data/supabase';
import { errorMessage } from '../data/store';
import { translateAuthError } from '../lib/authErrors';

type Mode = 'signin' | 'signup' | 'code';
type CodeStep = 'email' | 'verify';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [codeStep, setCodeStep] = useState<CodeStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = (next: Mode) => {
    setMode(next);
    setCodeStep('email');
    setCode('');
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
      setError(translateAuthError(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && password.length < 8) return setError('Mot de passe trop court (8 caractères minimum).');
    void run(async () => {
      if (!supabase) return;
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        // Sans session, Supabase attend la confirmation de l'e-mail.
        if (!data.session) {
          setInfo('Compte créé. Confirmez votre adresse via le message reçu par e-mail, puis connectez-vous.');
          setMode('signin');
        }
      }
    });
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      if (!supabase) return;
      const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (err) throw err;
      setCodeStep('verify');
      setInfo(`Code envoyé à ${email.trim()}. Pensez à regarder dans les courriers indésirables.`);
    });
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!supabase) return;
      const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
      if (err) throw err;
      // La session est reprise par App via onAuthStateChange.
    });
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">Dollo</h1>
        <p className="tagline">Tétées, couches, siestes. Notés en un geste, partagés entre parents.</p>

        {mode !== 'code' && (
          <form onSubmit={submitPassword}>
            <label className="field">
              <span className="label">E-mail</span>
              <input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Mot de passe</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Messages error={error} info={info} />
            <button type="submit" className="btn primary block" disabled={busy}>
              {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        )}

        {mode === 'code' && codeStep === 'email' && (
          <form onSubmit={sendCode}>
            <p className="hint">Sans mot de passe : nous vous envoyons un code à 6 chiffres par e-mail. Idéal si un proche vous a invité(e).</p>
            <label className="field">
              <span className="label">E-mail</span>
              <input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <Messages error={error} info={info} />
            <button type="submit" className="btn primary block" disabled={busy}>
              Recevoir un code
            </button>
            <button type="button" className="link-btn" disabled={!email.trim()} onClick={() => setCodeStep('verify')}>
              J'ai déjà reçu un code
            </button>
          </form>
        )}

        {mode === 'code' && codeStep === 'verify' && (
          <form onSubmit={verifyCode}>
            <label className="field">
              <span className="label">Code reçu par e-mail</span>
              <input
                className="input code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))}
              />
              <span className="hint">Envoyé à {email.trim() || 'votre adresse'}.</span>
            </label>
            <Messages error={error} info={info} />
            <button type="submit" className="btn primary block" disabled={busy || code.replace(/\s/g, '').length < 6}>
              Valider
            </button>
            <div className="row-actions">
              <button type="button" className="link-btn" disabled={busy} onClick={() => sendCode()}>
                Renvoyer un code
              </button>
              <button type="button" className="link-btn" onClick={() => setCodeStep('email')}>
                Changer d'adresse
              </button>
            </div>
          </form>
        )}

        {mode === 'signin' && (
          <button type="button" className="link-btn" onClick={() => reset('code')}>
            Recevoir un code par e-mail (sans mot de passe)
          </button>
        )}
        {mode !== 'code' && (
          <button type="button" className="link-btn" onClick={() => reset(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
          </button>
        )}
        {mode === 'code' && (
          <button type="button" className="link-btn" onClick={() => reset('signin')}>
            Utiliser un mot de passe
          </button>
        )}
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
