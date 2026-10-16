import { useState } from 'react';
import { errorMessage, type Store } from '../data/store';
import { FEATURE_ORDER, FEATURES, fmtPeriodEnd, PLAN_ORDER, PRICES, type BillingStatus, type Feature, type PaidPlan } from '../lib/billing';
import { Icon } from './icons';
import { Sheet } from './Sheet';

interface Props {
  store: Store;
  /** Fonction qui a déclenché l'affichage (mise en avant) ; absente depuis les réglages ou un bandeau. */
  feature?: Feature;
  /** false pour une nounou : c'est aux parents d'activer Dollo+. */
  canBuy: boolean;
  billing: BillingStatus;
  onClose: () => void;
}

/** Présentation de Dollo+ et choix de la formule, puis paiement sur la page sécurisée de Stripe. */
export function Paywall({ store, feature, canBuy, billing, onClose }: Props) {
  const [plan, setPlan] = useState<PaidPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hero = feature ? FEATURES[feature] : null;
  const benefits = feature ? [feature, ...FEATURE_ORDER.filter((f) => f !== feature)] : FEATURE_ORDER;
  const giftEnd = billing.plan === 'gift' && billing.periodEnd ? billing.periodEnd : null;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await store.startCheckout(plan));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Dollo+" onClose={onClose}>
      <div className="paywall">
        <h3 className="paywall-title">{hero ? hero.title : 'Tout Dollo, pour toute la famille'}</h3>
        <p className="paywall-pitch">
          {hero ? hero.pitch : "L'essentiel reste gratuit. Dollo+ ajoute ce qui fait gagner du temps et de la sérénité."}
        </p>
        {giftEnd && (
          <p className="paywall-gift">
            {billing.premium
              ? `Dollo+ vous est offert jusqu'au ${fmtPeriodEnd(giftEnd)}. Choisissez une formule pour ne rien perdre ensuite.`
              : `Votre période offerte s'est terminée le ${fmtPeriodEnd(giftEnd)}. Vos données sont toutes là : il suffit de réactiver Dollo+.`}
          </p>
        )}

        <ul className="paywall-benefits">
          {benefits.map((f) => (
            <li key={f} className={f === feature ? 'current' : undefined}>
              <Icon.Check size={18} />
              <span>{FEATURES[f].short}</span>
            </li>
          ))}
        </ul>

        {canBuy ? (
          <>
            <div className="plans" role="radiogroup" aria-label="Formule">
              {PLAN_ORDER.map((p) => {
                const price = PRICES[p];
                return (
                  <button key={p} type="button" role="radio" aria-checked={plan === p} className="plan" onClick={() => setPlan(p)}>
                    <span className="plan-head">
                      <span className="plan-label">{price.label}</span>
                      {price.badge && <span className="plan-badge">{price.badge}</span>}
                    </span>
                    <span className="plan-price">
                      {price.price} <small>{price.per}</small>
                    </span>
                    {price.note && <span className="plan-note">{price.note}</span>}
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="paywall-cta">
              <button type="button" className="btn primary block" disabled={busy} onClick={() => void buy()}>
                {busy ? 'Ouverture du paiement…' : `Continuer · ${PRICES[plan].price}`}
              </button>
            </div>
            <p className="paywall-fine">
              Un seul paiement couvre toute la famille : l'autre parent et la nounou en profitent.{' '}
              {plan === 'lifetime' ? 'Aucun renouvellement.' : 'Résiliable à tout moment, en deux gestes.'} Paiement sécurisé par Stripe (carte, Apple
              Pay, Google Pay).
            </p>
          </>
        ) : (
          <p className="paywall-gift">
            {store.mode === 'cloud'
              ? 'Dollo+ est activé par les parents, depuis Réglages → Dollo+. Il couvre aussi votre accès.'
              : 'Dollo+ nécessite un compte en ligne.'}
          </p>
        )}
      </div>
    </Sheet>
  );
}
