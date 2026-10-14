import { useCallback, useEffect, useState } from 'react';
import { errorMessage, type Store } from '../data/store';
import type { Baby, Member } from '../lib/types';
import { useToast } from './toast';

interface Props {
  store: Store;
  baby: Baby;
  /** E-mail de l'utilisateur connecté, pour se reconnaître dans la liste. */
  myEmail: string | null;
  /** Appelé après un retrait : le code d'invitation a été renouvelé côté base. */
  onBabyChanged: () => void;
}

/** Qui suit le bébé ; le propriétaire (créateur du suivi) peut retirer un parent. */
export function Members({ store, baby, myEmail, onBabyChanged }: Props) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await store.listMembers(baby.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [store, baby.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const me = myEmail?.toLowerCase() ?? null;
  const iAmOwner = members.some((m) => m.role === 'owner' && m.email.toLowerCase() === me);

  const remove = async (m: Member) => {
    setBusy(true);
    try {
      await store.removeMember(baby.id, m.userId);
      toast.show(`${m.email} n'a plus accès au suivi de ${baby.name}.`);
      setConfirming(null);
      await load();
      onBabyChanged();
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="form-error">Membres indisponibles : {error}</p>;
  if (members.length === 0) return null;

  return (
    <ul className="invitation-list members" aria-label="Personnes ayant accès">
      {members.map((m) => {
        const isMe = m.email.toLowerCase() === me;
        return (
          <li key={m.userId} className="invitation accepted">
            <span className="invitation-main">
              <span className="invitation-email">{m.email}</span>
              <span className="invitation-status">
                {m.role === 'owner' ? 'Créateur du suivi' : 'Parent'}
                {isMe ? ' · vous' : ''}
              </span>
            </span>
            {iAmOwner && !isMe && m.role !== 'owner' && (
              <span className="invitation-actions">
                {confirming === m.userId ? (
                  <>
                    <button type="button" className="link-btn danger" disabled={busy} onClick={() => void remove(m)}>
                      Confirmer le retrait
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirming(null)}>
                      Garder
                    </button>
                  </>
                ) : (
                  <button type="button" className="link-btn danger" onClick={() => setConfirming(m.userId)}>
                    Retirer
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
