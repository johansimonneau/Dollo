import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { errorMessage, type Store } from '../data/store';
import { DAY } from '../lib/time';
import type { Baby, Invitation } from '../lib/types';
import { useToast } from './toast';

interface Props {
  store: Store;
  baby: Baby;
  now: number;
}

type Status = 'accepted' | 'expired' | 'pending';

const statusOf = (i: Invitation, now: number): Status => (i.acceptedAt ? 'accepted' : new Date(i.expiresAt).getTime() <= now ? 'expired' : 'pending');

function statusLabel(i: Invitation, now: number): string {
  switch (statusOf(i, now)) {
    case 'accepted':
      return 'A rejoint';
    case 'expired':
      return 'Expirée';
    case 'pending': {
      // round, pas ceil : l'horloge de l'écran peut avoir quelques secondes de retard (« 14 j » et non « 15 j » juste après l'envoi).
      const days = Math.max(1, Math.round((new Date(i.expiresAt).getTime() - now) / DAY));
      return `En attente · expire dans ${days} j`;
    }
  }
}

/** Invitation d'un parent par e-mail : il reçoit un code, se connecte avec cette adresse et retrouve le bébé. */
export function InviteByEmail({ store, baby, now }: Props) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvitations(await store.listInvitations(baby.id));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [store, baby.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (address: string) => {
    setBusy(true);
    try {
      const res = await store.inviteParent(baby.id, address);
      if (res.emailSent) {
        toast.show(`Invitation envoyée à ${res.invitation.email}.`);
      } else {
        toast.show(
          `Invitation enregistrée, mais l'e-mail n'est pas parti (${res.emailError}). ${res.invitation.email} rejoindra ${baby.name} en se connectant avec cette adresse.`,
          { tone: 'error', durationMs: 12_000 },
        );
      }
      setEmail('');
      await load();
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) void send(email.trim());
  };

  const cancel = async (i: Invitation) => {
    try {
      await store.cancelInvitation(i.id);
      toast.show(`Invitation de ${i.email} annulée.`);
      await load();
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <div className="invite-email">
      <form onSubmit={submit} className="inline-form" aria-label="Inviter par e-mail">
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="E-mail de l'autre parent"
          aria-label="E-mail de l'autre parent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          Inviter
        </button>
      </form>
      <p className="hint">La personne reçoit un code par e-mail, se connecte avec cette adresse, et retrouve {baby.name} automatiquement.</p>

      {loadError && <p className="form-error">Invitations indisponibles : {loadError}</p>}
      {invitations.length > 0 && (
        <ul className="invitation-list" aria-label="Invitations envoyées">
          {invitations.map((i) => {
            const status = statusOf(i, now);
            return (
              <li key={i.id} className={`invitation ${status}`}>
                <span className="invitation-main">
                  <span className="invitation-email">{i.email}</span>
                  <span className="invitation-status">{statusLabel(i, now)}</span>
                </span>
                {status !== 'accepted' && (
                  <span className="invitation-actions">
                    <button type="button" className="link-btn" disabled={busy} onClick={() => void send(i.email)}>
                      Renvoyer
                    </button>
                    <button type="button" className="link-btn danger" onClick={() => void cancel(i)}>
                      Annuler
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
