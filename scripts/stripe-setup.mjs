#!/usr/bin/env node
// Prépare le compte Stripe pour Dollo+ en une commande, sans rien saisir dans le tableau de bord :
//   - produits « Dollo+ » (3,99 €/mois, 29,99 €/an) et « Dollo+ à vie » (49,99 €), prix TTC ;
//   - portail client (carte, factures, passage mensuel ↔ annuel, résiliation en fin de période) ;
//   - point de terminaison du webhook vers la fonction Supabase billing-webhook.
// Relançable sans risque : ce qui existe déjà (même lookup_key, même adresse de webhook) est réutilisé.
//
// Usage (clé de TEST d'abord ; la clé reste dans votre terminal, jamais dans le code) :
//   STRIPE_SECRET_KEY=sk_test_… SUPABASE_URL=https://xxxx.supabase.co node scripts/stripe-setup.mjs
// En production, ajoutez --live (et une clé sk_live_… ou rk_live_…).

const API_VERSION = '2026-08-26.dahlia'; // identique à supabase/functions/_shared/stripe.ts
const key = process.env.STRIPE_SECRET_KEY ?? '';
const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const live = process.argv.includes('--live');

if (!/^(sk|rk)_(test|live)_/.test(key)) fail('STRIPE_SECRET_KEY manquante (sk_test_… ou rk_test_…).');
if (key.includes('_live_') && !live) fail('Clé LIVE détectée : relancez avec --live si c’est voulu (testez d’abord avec une clé de test).');
if (!key.includes('_live_') && live) fail('--live demandé avec une clé de test.');
if (!/^https:\/\/.+/.test(supabaseUrl)) fail('SUPABASE_URL manquante (https://xxxx.supabase.co).');

const PLANS = [
  { env: 'STRIPE_PRICE_MONTHLY', lookup: 'dollo_plus_monthly', product: 'plus', amount: 399, interval: 'month' },
  { env: 'STRIPE_PRICE_YEARLY', lookup: 'dollo_plus_yearly', product: 'plus', amount: 2999, interval: 'year' },
  { env: 'STRIPE_PRICE_LIFETIME', lookup: 'dollo_plus_lifetime', product: 'lifetime', amount: 4999 },
];
const PRODUCTS = {
  plus: { name: 'Dollo+', description: 'Nounou, rappels, rapport pédiatre, courbes OMS, stock de lait, plusieurs bébés. Pour toute la famille.' },
  lifetime: { name: 'Dollo+ à vie', description: 'Dollo+ pour toute la petite enfance, en un seul paiement.' },
};
const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Aplatit { a: { b: [1] } } en a[b][0]=1 (format de l'API Stripe). */
function flatten(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object') flatten(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

async function stripe(method, path, params) {
  const body = params ? flatten(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': API_VERSION },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) fail(`${method} ${path} : ${json.error?.message ?? res.status}`);
  return json;
}

// 1. Produits et prix (retrouvés par lookup_key)
const existing = await stripe('GET', 'prices', { lookup_keys: PLANS.map((p) => p.lookup), active: true, expand: ['data.product'], limit: 10 });
const byLookup = new Map(existing.data.map((p) => [p.lookup_key, p]));
const productIds = {};
for (const p of existing.data) {
  const plan = PLANS.find((x) => x.lookup === p.lookup_key);
  if (plan) productIds[plan.product] ??= p.product.id;
}
for (const [id, def] of Object.entries(PRODUCTS)) {
  if (productIds[id]) continue;
  productIds[id] = (await stripe('POST', 'products', { name: def.name, description: def.description, metadata: { dollo: id } })).id;
  console.log(`+ produit « ${def.name} »`);
}
const priceIds = {};
for (const plan of PLANS) {
  let price = byLookup.get(plan.lookup);
  if (!price) {
    price = await stripe('POST', 'prices', {
      product: productIds[plan.product],
      currency: 'eur',
      unit_amount: plan.amount,
      // Prix affichés TTC aux parents : la TVA éventuelle est incluse, pas ajoutée.
      tax_behavior: 'inclusive',
      lookup_key: plan.lookup,
      ...(plan.interval ? { recurring: { interval: plan.interval } } : {}),
    });
    console.log(`+ prix ${plan.lookup} (${(plan.amount / 100).toFixed(2).replace('.', ',')} €)`);
  }
  priceIds[plan.env] = price.id;
}

// 2. Portail client (mis à jour s'il existe déjà)
const configs = await stripe('GET', 'billing_portal/configurations', { active: true, limit: 100 });
const previous = configs.data.find((c) => c.metadata?.dollo === 'portal');
const portal = await stripe('POST', previous ? `billing_portal/configurations/${previous.id}` : 'billing_portal/configurations', {
  business_profile: { headline: 'Gérer Dollo+' },
  features: {
    customer_update: { enabled: false },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'missing_features', 'other'] } },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products: [{ product: productIds.plus, prices: [priceIds.STRIPE_PRICE_MONTHLY, priceIds.STRIPE_PRICE_YEARLY] }],
    },
  },
  metadata: { dollo: 'portal' },
});
console.log(`${previous ? '=' : '+'} portail client ${portal.id}`);

// 3. Webhook
const webhookUrl = `${supabaseUrl}/functions/v1/billing-webhook`;
const endpoints = await stripe('GET', 'webhook_endpoints', { limit: 100 });
let webhookSecret = null;
const found = endpoints.data.find((e) => e.url === webhookUrl);
if (found) {
  await stripe('POST', `webhook_endpoints/${found.id}`, { enabled_events: EVENTS });
  console.log(`= webhook ${found.id} déjà présent (événements mis à jour). Son secret se lit dans Stripe → Développeurs → Webhooks.`);
} else {
  const created = await stripe('POST', 'webhook_endpoints', { url: webhookUrl, enabled_events: EVENTS, api_version: API_VERSION, description: 'Dollo+ (Supabase billing-webhook)' });
  webhookSecret = created.secret;
  console.log(`+ webhook ${created.id} → ${webhookUrl}`);
}

console.log('\nÀ donner aux fonctions Supabase (en plus de STRIPE_SECRET_KEY et APP_URL) :\n');
console.log(
  `supabase secrets set ${Object.entries(priceIds)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')} STRIPE_PORTAL_CONFIGURATION=${portal.id}${webhookSecret ? ` STRIPE_WEBHOOK_SECRET=${webhookSecret}` : ''}`,
);
console.log(`\nMode ${live ? 'LIVE' : 'TEST'} terminé.`);
