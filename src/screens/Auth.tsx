import { useState, type FormEvent } from 'react';
import { supabase } from '../data/supabase';
import { errorMessage } from '../data/store';

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail).";
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail. Connectez-vous.';
  if (m.includes('password should be at least') || m.includes('weak password')) return 'Mot de passe trop court (8 caractères minimum).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Connexion impossible. Vérifiez votre réseau.';
  return message;
}

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    if (mode === 'signup' && password.length < 8) return setError('Mot de passe trop court (8 caractères minimum).');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        // Sans session, Supabase attend la confirmation de l'e-mail.
        if (!data.session) {
          setInfo('Compte créé. Confirmez votre adresse via le lien reçu par e-mail, puis connectez-vous.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(translate(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">Dollo</h1>
        <p className="tagline">Tétées, couches, siestes. Notés en un geste, partagés entre parents.</p>

        <form onSubmit={submit}>
          <label className="field">
            <span className="label">E-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {info && <p className="form-info">{info}</p>}

          <button type="submit" className="btn primary block" disabled={busy}>
            {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'signin' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </main>
  );
}
