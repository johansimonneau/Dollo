// Dollo+ côté serveur : correspondance Stripe → droits, et vérification de la signature des webhooks.
// Sans dépendance (Deno et Node) : testé par src/lib/billingServer.test.ts.

export type PaidPlan = 'monthly' | 'yearly' | 'lifetime';
export const PAID_PLANS: readonly PaidPlan[] = ['monthly', 'yearly', 'lifetime'];

/** Identifiants des prix Stripe (price_…), donnés en secrets de fonction. */
export type PriceIds = Partial<Record<PaidPlan, string>>;

export function planForPrice(priceId: string | null | undefined, prices: PriceIds): PaidPlan | null {
  if (!priceId) return null;
  return PAID_PLANS.find((p) => prices[p] === priceId) ?? null;
}

/** Ligne de la table `entitlements` (migration 0010). */
export interface EntitlementRow {
  user_id: string;
  plan: PaidPlan;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_ref: string;
}

/** Ce que l'on lit d'un abonnement Stripe (tous API, y compris 2025+ où la fin de période est portée par l'article). */
export interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { current_period_end?: number; price?: { id?: string } }[] };
}

const customerId = (c: StripeSubscription['customer']) => (typeof c === 'string' ? c : c.id);
const isoFromUnix = (s: number | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/** Droit correspondant à un abonnement ; null si le prix n'est pas un prix Dollo+. */
export function entitlementFromSubscription(sub: StripeSubscription, userId: string, prices: PriceIds): EntitlementRow | null {
  const item = sub.items?.data?.[0];
  const plan = planForPrice(item?.price?.id, prices);
  if (!plan || plan === 'lifetime') return null;
  return {
    user_id: userId,
    plan,
    status: sub.status,
    current_period_end: isoFromUnix(item?.current_period_end ?? sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    stripe_customer_id: customerId(sub.customer),
    stripe_ref: sub.id,
  };
}

/** Session Checkout terminée en mode paiement (achat à vie). */
export interface StripeCheckoutSession {
  id: string;
  mode: 'payment' | 'subscription' | 'setup';
  payment_status?: string;
  customer?: string | { id: string } | null;
  client_reference_id?: string | null;
  subscription?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

export function entitlementFromLifetime(session: StripeCheckoutSession, userId: string): EntitlementRow | null {
  if (session.mode !== 'payment' || session.metadata?.plan !== 'lifetime') return null;
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return null;
  return {
    user_id: userId,
    plan: 'lifetime',
    status: 'active',
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_customer_id: session.customer ? (typeof session.customer === 'string' ? session.customer : session.customer.id) : null,
    stripe_ref: session.id,
  };
}

export const CHECKOUT_INTEGRATION_ID = 'dollo-plus-checkout-qhvkrnwz';

/** Abonnement concerné par une facture (API 2025+ : `parent.subscription_details`, avant : `subscription`). */
export function invoiceSubscriptionId(invoice: {
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
}): string | null {
  const s = invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
  return s ? (typeof s === 'string' ? s : s.id) : null;
}

/** Paramètres d'une session Checkout (format attendu par l'API Stripe, en x-www-form-urlencoded). */
export function checkoutParams(opts: {
  plan: PaidPlan;
  priceId: string;
  customer: string;
  userId: string;
  appUrl: string;
  trialDays?: number;
  /** TVA par Stripe Tax : seulement quand une immatriculation est active dans Stripe (sinon rien n'est collecté). */
  automaticTax?: boolean;
}): Record<string, string> {
  const p: Record<string, string> = {
    mode: opts.plan === 'lifetime' ? 'payment' : 'subscription',
    'line_items[0][price]': opts.priceId,
    'line_items[0][quantity]': '1',
    customer: opts.customer,
    client_reference_id: opts.userId,
    'metadata[user_id]': opts.userId,
    'metadata[plan]': opts.plan,
    success_url: `${opts.appUrl}/?app&billing=success`,
    cancel_url: `${opts.appUrl}/?app&billing=cancel`,
    allow_promotion_codes: 'true',
    locale: 'fr',
    // Repère du parcours dans le tableau de bord Stripe (comparaison des parcours de paiement).
    integration_identifier: CHECKOUT_INTEGRATION_ID,
  };
  if (opts.automaticTax) {
    p['automatic_tax[enabled]'] = 'true';
    // Client créé avant le paiement, sans adresse : la TVA est calculée sur l'adresse saisie au paiement.
    p['customer_update[address]'] = 'auto';
    p.billing_address_collection = 'required';
  }
  if (opts.plan === 'lifetime') {
    p['payment_intent_data[metadata][user_id]'] = opts.userId;
  } else {
    // Retrouvé dans chaque événement d'abonnement (renouvellement, résiliation), même sans la session d'origine.
    p['subscription_data[metadata][user_id]'] = opts.userId;
    if (opts.trialDays && opts.trialDays > 0) p['subscription_data[trial_period_days]'] = String(Math.floor(opts.trialDays));
  }
  return p;
}

/** Adresse de l'app où revenir après le paiement : APP_URL si fournie (liste séparée par des virgules), sinon l'origine de l'appel. */
export function resolveAppUrl(appUrlEnv: string, origin: string | null): string | null {
  const allowed = appUrlEnv
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const o = origin?.replace(/\/+$/, '') ?? null;
  if (allowed.length === 0) return o && /^https?:\/\//.test(o) ? o : null;
  return o && allowed.includes(o) ? o : allowed[0];
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Comparaison en temps constant (la signature attendue ne doit pas fuiter par la durée de la comparaison). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function stripeSignature(payload: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}

/**
 * Vérifie l'en-tête `Stripe-Signature` (t=…,v1=…) : HMAC-SHA256 du corps BRUT avec le secret du webhook,
 * et horodatage à moins de 5 minutes (rejeu d'un ancien envoi refusé).
 */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSec: number, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((kv) => kv.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || signatures.length === 0 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await stripeSignature(payload, secret, t);
  return signatures.some((s) => safeEqual(s, expected));
}
