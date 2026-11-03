/**
 * Étapes clés du parcours, envoyées à Vercel Analytics (événements personnalisés) pour mesurer les campagnes
 * au-delà de la page vue : inscription → premier bébé → paiement lancé → Dollo+ actif.
 *
 * - Aucune donnée personnelle ni de santé : seulement le nom de l'étape et l'offre choisie.
 * - Les UTM du dernier contact sont rattachés par le `beforeSend` de main.tsx, comme pour les pages vues.
 * - Ne bloque et ne casse jamais l'app : un échec d'envoi est ignoré.
 * La source de vérité des conversions reste la base (schéma `analytics`, migration 0011).
 */
import { track as vercelTrack } from '@vercel/analytics/react';
import type { PaidPlan } from './billing';

export type Conversion =
  | { name: 'sign_up' }
  | { name: 'baby_created'; first: boolean }
  | { name: 'checkout_started'; plan: PaidPlan }
  | { name: 'purchase' };

type Sender = (name: string, props?: Record<string, string | boolean>) => void;

let send: Sender = (name, props) => vercelTrack(name, props);

/** Pour les tests. */
export function setSender(s: Sender) {
  send = s;
}

export function trackConversion(event: Conversion) {
  const { name, ...props } = event;
  try {
    send(name, Object.keys(props).length ? props : undefined);
  } catch {
    /* mesure non vitale */
  }
}
