import type { PaidPlan } from '../../supabase/functions/_shared/billing';
import { dayKey, fmtDate } from './time';

export type { PaidPlan };
export type Plan = PaidPlan | 'gift';

/** État Dollo+ de l'utilisateur connecté (fonction `billing_status()`, migration 0010). */
export interface BillingStatus {
  /** false : mode local, ou base sans la migration 0010. Tout est alors ouvert. */
  enforced: boolean;
  /** Dollo+ actif pour l'utilisateur lui-même (abonnement, achat à vie ou cadeau). */
  premium: boolean;
  /** Droit le plus avantageux, actif ou non (un cadeau terminé reste visible pour le proposer à nouveau). */
  plan: Plan | null;
  status: string | null;
  /** Fin de la période payée ou offerte ; null = à vie. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Bébés couverts : il suffit qu'UN parent ait Dollo+ pour que toute la famille (et la nounou) en profite. */
  premiumBabyIds: string[];
}

export const UNLOCKED: BillingStatus = {
  enforced: false,
  premium: true,
  plan: null,
  status: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  premiumBabyIds: [],
};

/** Ce que débloque Dollo+. L'ordre est celui de la liste des avantages. */
export type Feature = 'nanny' | 'push' | 'report' | 'growth' | 'milk' | 'babies' | 'export';

export const FEATURES: Record<Feature, { title: string; pitch: string; short: string }> = {
  nanny: {
    short: 'Partage avec la nounou',
    title: 'Confiez le suivi à la nounou',
    pitch: 'Elle note biberons, couches et dodos, vous les voyez en direct. Sans accès à vos informations.',
  },
  push: {
    short: 'Rappels même app fermée',
    title: 'Ne ratez plus un repas',
    pitch: 'Notifications sur le téléphone, même app fermée : prochain repas, couche, vitamine D. Silencieuses la nuit si vous voulez.',
  },
  report: {
    short: 'Rapport pour le pédiatre',
    title: 'Le rapport pour le pédiatre',
    pitch: 'Une page claire avec la semaine, les mesures, les courbes et vos notes. À imprimer ou envoyer en PDF.',
  },
  growth: {
    short: 'Courbes de croissance OMS',
    title: 'Suivez sa croissance',
    pitch: "Poids, taille et périmètre crânien sur les courbes de l'OMS, avec le percentile à chaque pesée.",
  },
  milk: {
    short: 'Stock de lait tiré',
    title: 'Gérez votre stock de lait',
    pitch: 'Frigo et congélateur, dates limites, alerte avant péremption, et le sachet à utiliser en premier.',
  },
  babies: {
    short: 'Plusieurs bébés',
    title: 'Jumeaux ou petit frère ?',
    pitch: 'Suivez plusieurs bébés avec le même compte, chacun avec son journal.',
  },
  export: {
    short: 'Export Excel (CSV)',
    title: 'Exportez tout le journal',
    pitch: 'Tout le journal en tableau, à ouvrir dans Excel ou Numbers.',
  },
};
export const FEATURE_ORDER = Object.keys(FEATURES) as Feature[];

/**
 * Prix affichés dans l'app. À garder identiques aux prix Stripe (STRIPE_PRICE_MONTHLY / YEARLY / LIFETIME) :
 * c'est Stripe qui encaisse, ces libellés ne servent qu'à l'affichage.
 */
export const PRICES: Record<PaidPlan, { label: string; price: string; per: string; note?: string; badge?: string }> = {
  yearly: { label: 'Annuel', price: '29,99 €', per: 'par an', note: 'soit 2,50 € par mois', badge: '−37 %' },
  monthly: { label: 'Mensuel', price: '3,99 €', per: 'par mois', note: 'sans engagement' },
  lifetime: { label: 'À vie', price: '49,99 €', per: 'une seule fois', note: 'pour toute la petite enfance' },
};
export const PLAN_ORDER: PaidPlan[] = ['yearly', 'monthly', 'lifetime'];

export const PLAN_NAME: Record<Plan, string> = { monthly: 'mensuel', yearly: 'annuel', lifetime: 'à vie', gift: 'offert' };

/** Fonctions d'un bébé : couvertes si la famille a Dollo+. « Plusieurs bébés » dépend du compte lui-même. */
export function unlocked(b: BillingStatus, feature: Feature, babyId: string | null): boolean {
  if (!b.enforced) return true;
  if (feature === 'babies' || !babyId) return b.premium;
  return b.premiumBabyIds.includes(babyId);
}

const DAY = 86_400_000;

/** Le bandeau de fin de période offerte apparaît ces derniers jours. */
export const NUDGE_DAYS = 5;

/** « 15 janv. 2027 » (date locale de fin de période). */
export const fmtPeriodEnd = (iso: string) => fmtDate(dayKey(new Date(iso).getTime()));

/** Jours restants (arrondi supérieur) avant la fin de la période ; null si à vie ou inconnue. */
export function daysLeft(b: BillingStatus, now: number): number | null {
  if (!b.periodEnd) return null;
  return Math.ceil((new Date(b.periodEnd).getTime() - now) / DAY);
}

/** Bandeau d'upsell sur « Aujourd'hui » : fin des 14 jours offerts (5 derniers jours) ou période offerte terminée depuis peu. */
export function giftNudge(b: BillingStatus, now: number): { kind: 'ending'; days: number } | { kind: 'ended' } | null {
  if (!b.enforced || b.plan !== 'gift') return null;
  const days = daysLeft(b, now);
  if (days === null) return null;
  if (b.premium && days <= NUDGE_DAYS) return { kind: 'ending', days: Math.max(1, days) };
  if (!b.premium && days > -30) return { kind: 'ended' };
  return null;
}

/** Ligne lue de la base (jsonb). */
export interface BillingRow {
  premium?: boolean;
  plan?: Plan | null;
  status?: string | null;
  period_end?: string | null;
  cancel_at_period_end?: boolean;
  premium_baby_ids?: string[] | null;
}

export const toBilling = (r: BillingRow): BillingStatus => ({
  enforced: true,
  premium: !!r.premium,
  plan: r.plan ?? null,
  status: r.status ?? null,
  periodEnd: r.period_end ?? null,
  cancelAtPeriodEnd: !!r.cancel_at_period_end,
  premiumBabyIds: r.premium_baby_ids ?? [],
});
