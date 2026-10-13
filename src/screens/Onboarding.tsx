import { useState, type FormEvent } from 'react';
import { errorMessage, type Store } from '../data/store';
import type { Baby } from '../lib/types';
import { dayKey } from '../lib/time';

interface Props {
  store: Store;
  /** Premier lancement : pas de bouton « Annuler ». */
  first: boolean;
  onDone: (baby: Baby) => void;
  onCancel?: () => void;
}

export function Onboarding({ store, first, onDone, onCancel }: Props) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Indiquez le prénom de bébé.');
    setBusy(true);
    setError(null);
    try {
      onDone(await store.createBaby({ name: name.trim(), birthDate: birthDate || null }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError("Saisissez le code d'invitation.");
    setBusy(true);
    setError(null);
    try {
      onDone(await store.joinBaby(code));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="logo">{first ? 'Bienvenue' : 'Ajouter un bébé'}</h1>
        <p className="tagline">{first ? 'Commençons par faire connaissance avec votre petit·e.' : 'Un second profil, pour des jumeaux ou un petit frère.'}</p>

        <form onSubmit={create}>
          <label className="field">
            <span className="label">Prénom</span>
            <input className="input" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Date de naissance</span>
            <input className="input" type="date" value={birthDate} max={dayKey(Date.now())} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn primary block" disabled={busy}>
            {first ? 'Commencer' : 'Ajouter'}
          </button>
        </form>

        {store.mode === 'cloud' && (
          <form onSubmit={join} className="join-box">
            <p className="label">Votre partenaire a déjà créé le profil ?</p>
            <div className="inline-form">
              <input
                className="input"
                value={code}
                placeholder="Code d'invitation"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Code d'invitation"
                onChange={(e) => setCode(e.target.value)}
              />
              <button type="submit" className="btn" disabled={busy}>
                Rejoindre
              </button>
            </div>
          </form>
        )}

        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </main>
  );
}
