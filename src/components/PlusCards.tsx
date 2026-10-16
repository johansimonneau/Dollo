import { useState } from 'react';
import { daysLeft, FEATURES, fmtPeriodEnd, giftNudge, PLAN_NAME, type Feature } from '../lib/billing';
import { dayKey } from '../lib/time';
import { usePremium } from './premium';

/** Réglages → Dollo+ : formule en cours, ou présentation de l'offre. */
export function PlusCard({ babyName, now }: { babyName: string; now: number }) {
  const { billing, has, openPaywall, manage } = usePremium();
  if (!billing.enforced) return null;
  const end = billing.periodEnd ? fmtPeriodEnd(billing.periodEnd) : null;
  const paid = billing.premium && billing.plan && billing.plan !== 'gift';

  let status: string;
  if (paid && billing.plan === 'lifetime') status = 'Dollo+ à vie. Merci de soutenir Dollo !';
  else if (paid) {
    status = `Formule ${PLAN_NAME[billing.plan!]}${billing.status === 'trialing' ? " · période d'essai" : ''}. ${
      billing.cancelAtPeriodEnd ? `Se termine le ${end} (résiliée).` : `Renouvelée le ${end}.`
    }`;
    if (billing.status === 'past_due') status += ' Le dernier paiement a échoué : mettez à jour votre carte.';
  } else if (billing.premium) {
    const days = daysLeft(billing, now) ?? 0;
    status = `Offert jusqu'au ${end} (encore ${days} jour${days > 1 ? 's' : ''}).`;
  } else if (has('report')) status = `Actif pour ${babyName} grâce à l'autre parent.`;
  else status = "Vous utilisez la version gratuite : saisie, journal, stats et partage entre parents.";

  return (
    <section className="card pad plus-card" aria-label="Dollo+">
      <h2 className="section-title flush">
        <span className="plus-tag">Dollo+</span>
      </h2>
      <p className="hint">{status}</p>
      {paid && billing.plan !== 'lifetime' ? (
        <button type="button" className="btn" onClick={() => void manage()}>
          Gérer mon abonnement
        </button>
      ) : paid ? null : (
        <button type="button" className="btn primary" onClick={() => openPaywall()}>
          {billing.premium ? 'Choisir ma formule' : 'Découvrir Dollo+'}
        </button>
      )}
    </section>
  );
}

const DISMISS_KEY = 'dollo:plus-nudge';

/** Bandeau sur « Aujourd'hui » : fin de la période offerte (5 derniers jours), puis période terminée. Masquable pour la journée. */
export function PlusNudge({ now }: { now: number }) {
  const { billing, openPaywall } = usePremium();
  const nudge = giftNudge(billing, now);
  const today = dayKey(now);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today;
    } catch {
      return false;
    }
  });
  if (!nudge || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, today);
    } catch {
      /* préférence non vitale */
    }
  };
  return (
    <div className="plus-nudge" role="status">
      <button type="button" className="plus-nudge-main" onClick={() => openPaywall()}>
        <span className="plus-tag">Dollo+</span>
        <span>
          {nudge.kind === 'ending'
            ? `Offert encore ${nudge.days} jour${nudge.days > 1 ? 's' : ''}`
            : 'Votre période offerte est terminée'}
          <small>
            {nudge.kind === 'ending'
              ? 'Gardez la nounou, les rappels et le rapport pédiatre : dès 2,50 € par mois.'
              : 'Vos courbes, rapports et rappels vous attendent. Toutes vos données sont conservées.'}
          </small>
        </span>
      </button>
      <button type="button" className="link-btn" onClick={dismiss}>
        Plus tard
      </button>
    </div>
  );
}

/** À la place d'un écran réservé à Dollo+ (ex. courbes de croissance) : ce qu'on y trouve et comment l'obtenir. */
export function LockedFeature({ feature }: { feature: Feature }) {
  const { openPaywall } = usePremium();
  const f = FEATURES[feature];
  return (
    <section className="card pad locked-feature">
      <span className="plus-tag">Dollo+</span>
      <h2 className="paywall-title">{f.title}</h2>
      <p className="hint">{f.pitch}</p>
      <button type="button" className="btn primary" onClick={() => openPaywall(feature)}>
        Débloquer avec Dollo+
      </button>
    </section>
  );
}

/** Accès nounou d'une famille sans Dollo+ : la base ne lui renvoie plus rien, on explique pourquoi. */
export function NannyLocked({ babyName, onSignOut }: { babyName: string; onSignOut: (() => void) | null }) {
  return (
    <div className="screen">
      <section className="card pad locked-feature">
        <span className="plus-tag">Dollo+</span>
        <h2 className="paywall-title">Accès nounou en pause</h2>
        <p className="hint">
          Le partage avec la nounou fait partie de Dollo+. Les parents de {babyName} peuvent le réactiver depuis Réglages → Dollo+ : vous
          retrouverez alors la journée de {babyName} immédiatement.
        </p>
        {onSignOut && (
          <button type="button" className="btn ghost" onClick={onSignOut}>
            Se déconnecter
          </button>
        )}
      </section>
    </div>
  );
}
