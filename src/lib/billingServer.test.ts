import { describe, expect, it } from 'vitest';
import {
  checkoutParams,
  entitlementFromLifetime,
  entitlementFromSubscription,
  planForPrice,
  resolveAppUrl,
  stripeSignature,
  verifyStripeSignature,
} from '../../supabase/functions/_shared/billing';

const prices = { monthly: 'price_m', yearly: 'price_y', lifetime: 'price_l' };

describe('webhook Stripe : signature', () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
  const t = 1_760_000_000;

  it('accepte un envoi signé et récent', async () => {
    const sig = await stripeSignature(payload, secret, t);
    expect(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, t + 10)).toBe(true);
    // Stripe envoie plusieurs signatures pendant un changement de secret : une seule bonne suffit.
    expect(await verifyStripeSignature(payload, `t=${t},v1=deadbeef,v1=${sig}`, secret, t)).toBe(true);
  });

  it('refuse un corps modifié, un mauvais secret, un rejeu ancien ou un en-tête absent', async () => {
    const sig = await stripeSignature(payload, secret, t);
    expect(await verifyStripeSignature(payload.replace('evt_1', 'evt_2'), `t=${t},v1=${sig}`, secret, t)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, 'whsec_autre', t)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, t + 301)).toBe(false);
    expect(await verifyStripeSignature(payload, null, secret, t)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, '', t)).toBe(false);
  });
});

describe('webhook Stripe : droits', () => {
  it('reconnaît les prix Dollo+', () => {
    expect(planForPrice('price_y', prices)).toBe('yearly');
    expect(planForPrice('price_autre', prices)).toBeNull();
    expect(planForPrice('price_x', {})).toBeNull();
  });

  it('abonnement : formule, statut et fin de période (API récente : portée par l’article)', () => {
    const row = entitlementFromSubscription(
      { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1_790_000_000, price: { id: 'price_y' } }] } },
      'u1',
      prices,
    );
    expect(row).toEqual({
      user_id: 'u1',
      plan: 'yearly',
      status: 'active',
      current_period_end: new Date(1_790_000_000_000).toISOString(),
      cancel_at_period_end: true,
      stripe_customer_id: 'cus_1',
      stripe_ref: 'sub_1',
    });
  });

  it('abonnement : ancienne API (fin de période sur l’abonnement)', () => {
    const row = entitlementFromSubscription(
      { id: 'sub_2', customer: { id: 'cus_2' }, status: 'canceled', current_period_end: 1_780_000_000, items: { data: [{ price: { id: 'price_m' } }] } },
      'u1',
      prices,
    );
    expect(row?.plan).toBe('monthly');
    expect(row?.status).toBe('canceled');
    expect(row?.stripe_customer_id).toBe('cus_2');
    expect(row?.current_period_end).toBe(new Date(1_780_000_000_000).toISOString());
  });

  it("ignore un abonnement qui n'est pas Dollo+", () => {
    expect(entitlementFromSubscription({ id: 'sub_3', customer: 'cus', status: 'active', items: { data: [{ price: { id: 'price_autre' } }] } }, 'u1', prices)).toBeNull();
  });

  it('achat à vie payé : Dollo+ sans date de fin ; non payé : rien', () => {
    const session = { id: 'cs_1', mode: 'payment' as const, payment_status: 'paid', customer: 'cus_1', metadata: { plan: 'lifetime', user_id: 'u1' } };
    expect(entitlementFromLifetime(session, 'u1')).toMatchObject({ plan: 'lifetime', status: 'active', current_period_end: null, stripe_ref: 'cs_1' });
    expect(entitlementFromLifetime({ ...session, payment_status: 'unpaid' }, 'u1')).toBeNull();
    expect(entitlementFromLifetime({ ...session, metadata: {} }, 'u1')).toBeNull();
  });
});

describe('paiement : session Checkout', () => {
  const base = { priceId: 'price_y', customer: 'cus_1', userId: 'u1', appUrl: 'https://dollo.app' };

  it('abonnement : compte rattaché à chaque événement, retour dans l’app', () => {
    const p = checkoutParams({ ...base, plan: 'yearly', trialDays: 7 });
    expect(p.mode).toBe('subscription');
    expect(p['subscription_data[metadata][user_id]']).toBe('u1');
    expect(p['subscription_data[trial_period_days]']).toBe('7');
    expect(p.client_reference_id).toBe('u1');
    expect(p.success_url).toBe('https://dollo.app/?app&billing=success');
    expect(p.locale).toBe('fr');
  });

  it('à vie : paiement unique, pas d’essai', () => {
    const p = checkoutParams({ ...base, plan: 'lifetime', priceId: 'price_l', trialDays: 7 });
    expect(p.mode).toBe('payment');
    expect(p['metadata[plan]']).toBe('lifetime');
    expect(p['subscription_data[trial_period_days]']).toBeUndefined();
  });

  it("adresse de retour : APP_URL l'emporte sur une origine inconnue", () => {
    expect(resolveAppUrl('https://dollo.app', 'https://evil.example')).toBe('https://dollo.app');
    expect(resolveAppUrl('https://dollo.app, https://preview.dollo.app/', 'https://preview.dollo.app')).toBe('https://preview.dollo.app');
    expect(resolveAppUrl('', 'http://localhost:5173')).toBe('http://localhost:5173');
    expect(resolveAppUrl('', null)).toBeNull();
  });
});
