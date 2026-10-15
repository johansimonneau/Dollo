import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { errorMessage, type Store } from '../data/store';
import { DAY } from '../lib/time';
import type { Baby, Invitation, InviteRole } from '../lib/types';
import { PlusTag, usePremium } from './premium';
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

/** Message à envoyer à la personne invitée (SMS, WhatsApp, e-mail…). */
export function invitationMessage(babyName: string, email: string, appUrl: string, role: InviteRole = 'parent'): string {
  const intro =
    role === 'nanny'
      ? `Pour noter la journée de ${babyName} (biberons, couches, dodos), je t'invite sur Dollo : on verra en direct ce que tu notes.\n\n`
      : `Je t'invite à suivre ${babyName} sur Dollo (tétées, biberons, couches, sommeil).\n\n`;
  return (
    intro +
    `1. Ouvre ${appUrl}\n` +
    `2. « Créer un compte » avec l'adresse ${email} et un mot de passe\n` +
    `3. Clique sur le lien de confirmation reçu par e-mail, puis connecte-toi : tu arriveras directement sur le suivi de ${babyName}.`
  );
}

/**
 * Invitation d'un parent : l'adresse est enregistrée, puis l'app partage un message (SMS, WhatsApp…) avec le lien.
 * La personne crée son compte avec mot de passe et cette adresse, et retrouve le bébé dès sa première connexion.
 */
export function InviteByEmail({ store, baby, now }: Props) {
  const toast = useToast();
  const premium = usePremium();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('parent');
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Les invitations acceptées n'apparaissent plus ici : la personne figure dans la liste des membres.
      setInvitations((await store.listInvitations(baby.id)).filter((i) => !i.acceptedAt));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [store, baby.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ouvre le menu de partage du téléphone ; à défaut (ordinateur), copie le message. */
  const share = async (address: string, inviteRole: InviteRole) => {
    const text = invitationMessage(baby.name, address, `${window.location.origin}/?app`, inviteRole);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Suivre ${baby.name} sur Dollo`, text });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return; // partage annulé par l'utilisateur
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`Message copié : collez-le dans un SMS, WhatsApp ou un e-mail à ${address}.`, { durationMs: 8000 });
    } catch {
      toast.show(`Envoyez ce lien à ${address} : ${window.location.origin}/?app`, { durationMs: 12_000 });
    }
  };

  const send = async (address: string, inviteRole: InviteRole) => {
    setBusy(true);
    try {
      const invitation = await store.inviteParent(baby.id, address, inviteRole);
      toast.show(`Invitation enregistrée pour ${invitation.email}${inviteRole === 'nanny' ? ' (nounou)' : ''}.`);
      setEmail('');
      await load();
      await share(invitation.email, inviteRole);
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) void send(email.trim(), role);
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
      <div className="segmented invite-role" role="group" aria-label="Inviter en tant que">
        <button type="button" aria-pressed={role === 'parent'} onClick={() => setRole('parent')}>
          Parent
        </button>
        <button type="button" aria-pressed={role === 'nanny'} onClick={() => premium.require('nanny') && setRole('nanny')}>
          Nounou {!premium.has('nanny') && <PlusTag />}
        </button>
      </div>
      <form onSubmit={submit} className="inline-form" aria-label="Inviter par e-mail">
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder={role === 'nanny' ? 'E-mail de la nounou' : "E-mail de l'autre parent"}
          aria-label={role === 'nanny' ? 'E-mail de la nounou' : "E-mail de l'autre parent"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          Inviter
        </button>
      </form>
      <p className="hint">
        {role === 'nanny'
          ? `La nounou voit et note les dernières 48 h, sans accès à vos informations (date de naissance, historique, membres, export). Vous la retirez en un geste.`
          : `Accès complet, comme vous.`}{' '}
        Envoyez-lui ensuite le lien (SMS, WhatsApp…) : la personne crée son compte avec cette adresse et un mot de passe, et retrouve {baby.name}{' '}
        automatiquement.
      </p>

      {loadError && <p className="form-error">Invitations indisponibles : {loadError}</p>}
      {invitations.length > 0 && (
        <ul className="invitation-list" aria-label="Invitations envoyées">
          {invitations.map((i) => {
            const status = statusOf(i, now);
            return (
              <li key={i.id} className={`invitation ${status}`}>
                <span className="invitation-main">
                  <span className="invitation-email">{i.email}</span>
                  <span className="invitation-status">
                    {i.role === 'nanny' ? 'Nounou · ' : ''}
                    {statusLabel(i, now)}
                  </span>
                </span>
                {status !== 'accepted' && (
                  <span className="invitation-actions">
                    {status === 'pending' ? (
                      <button type="button" className="link-btn" onClick={() => void share(i.email, i.role)}>
                        Envoyer le lien
                      </button>
                    ) : (
                      <button type="button" className="link-btn" disabled={busy} onClick={() => void send(i.email, i.role)}>
                        Renouveler
                      </button>
                    )}
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
