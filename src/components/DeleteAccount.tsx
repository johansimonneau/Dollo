import { useState, type FormEvent } from 'react';
import { DELETE_CONFIRMATION } from '../../supabase/functions/_shared/account';
import { errorMessage } from '../data/store';
import { usePremium } from './premium';
import { Sheet } from './Sheet';

interface Props {
  /** Accès nounou : pas de bébé à transmettre ni d'export à proposer. */
  nanny: boolean;
  /** Supprime le compte puis déconnecte ; une erreur est affichée dans la feuille (rien n'a été supprimé). */
  onDelete: () => Promise<void>;
}

/** « Supprimer mon compte » (Réglages → Compte) : conséquences claires, puis confirmation en recopiant un mot. */
export function DeleteAccount({ nanny, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { billing } = usePremium();
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION;
  const subscription = billing.premium && (billing.plan === 'monthly' || billing.plan === 'yearly');
  const lifetime = billing.premium && billing.plan === 'lifetime';

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="link-btn danger left" onClick={() => setOpen(true)}>
        Supprimer mon compte
      </button>
      {open && (
        <Sheet title="Supprimer mon compte" onClose={close}>
          <form onSubmit={submit}>
            <p className="hint">C'est définitif. Voici ce qui se passe :</p>
            <ul className="delete-list">
              {!nanny && <li>Un bébé que vous suivez avec un autre parent reste chez lui, avec tout son journal.</li>}
              {!nanny && <li>Un bébé que personne d'autre ne suit est effacé, avec son journal.</li>}
              {nanny && <li>Vous n'aurez plus accès au suivi ; ce que vous avez noté reste visible pour les parents.</li>}
              {subscription && <li>Votre abonnement Dollo+ est résilié tout de suite : plus aucun prélèvement.</li>}
              {lifetime && <li>Votre accès Dollo+ à vie est perdu.</li>}
              <li>Votre adresse e-mail et vos réglages sont effacés.</li>
            </ul>
            {!nanny && <p className="hint">Besoin d'une copie ? Exportez le journal avant (Réglages → Données).</p>}
            <label className="field">
              <span className="label">Pour confirmer, écrivez {DELETE_CONFIRMATION}</span>
              <input
                className="input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn danger block" disabled={!confirmed || busy}>
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
            <button type="button" className="btn ghost block" onClick={close} disabled={busy}>
              Annuler
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
