import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../data/supabase';
import { errorMessage } from '../data/store';
import { translateAuthError } from '../lib/authErrors';

type Step = 'email' | 'code';

/** Supabase refuse un nouvel envoi avant ~60 s : on l'annonce plutôt que d'afficher une erreur. */
const RESEND_DELAY_S = 60;

/**
 * Un seul chemin, identique pour créer un compte et pour se reconnecter :
 * 1. l'e-mail, 2. le code à 6 chiffres reçu par e-mail. Pas de mot de passe à créer ni à retrouver.
 */
export function AuthScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  /** Exécute une action d'authentification avec état « en cours » et message d'erreur lisible. */
  const run = async (action: () => Promise<void>) => {
    if (!supabase) return;
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(translateAuthError(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      if (!supabase) return;
      const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (err) throw err;
      setCode('');
      setStep('code');
      setWait(RESEND_DELAY_S);
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

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">Dollo</h1>
        <p className="tagline">Tétées, couches, siestes. Notés en un geste, partagés entre parents.</p>

        {step === 'email' && (
          <form onSubmit={sendCode}>
            <label className="field">
              <span className="label">Votre e-mail</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="hint">Pas de mot de passe : on vous envoie un code à 6 chiffres. Même démarche pour créer un compte ou vous reconnecter.</span>
            </label>
            <Messages error={error} />
            <button type="submit" className="btn primary block" disabled={busy || !email.trim()}>
              Recevoir mon code
            </button>
            <button type="button" className="link-btn" disabled={!email.trim()} onClick={() => setStep('code')}>
              J'ai déjà un code
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode}>
            <p className="form-info">
              Un code vient d'être envoyé à <strong>{email.trim()}</strong>. Il arrive en quelques secondes (pensez aux courriers indésirables).
            </p>
            <label className="field">
              <span className="label">Code à 6 chiffres</span>
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
            </label>
            <Messages error={error} />
            <button type="submit" className="btn primary block" disabled={busy || code.replace(/\s/g, '').length < 6}>
              Valider
            </button>
            <div className="row-actions">
              <button type="button" className="link-btn" disabled={busy || wait > 0} onClick={() => sendCode()}>
                {wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
              </button>
              <button type="button" className="link-btn" onClick={backToEmail}>
                Changer d'adresse
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Messages({ error }: { error: string | null }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
