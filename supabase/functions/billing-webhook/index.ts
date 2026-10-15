// Webhook Stripe : active, renouvelle ou retire Dollo+ (table entitlements). Seule écriture des droits.
// Déployée SANS vérification JWT (Stripe n'a pas de compte Supabase) : l'authenticité vient de la signature Stripe.
//   supabase functions deploy billing-webhook --no-verify-jwt
// Événements à cocher dans Stripe : checkout.session.completed, checkout.session.async_payment_succeeded,
// customer.subscription.created / updated / deleted, charge.refunded.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  entitlementFromLifetime,
  entitlementFromSubscription,
  verifyStripeSignature,
  type EntitlementRow,
  type PriceIds,
  type StripeCheckoutSession,
  type StripeSubscription,
} from '../_shared/billing.ts';
import { stripeApi } from '../_shared/stripe.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), env('STRIPE_WEBHOOK_SECRET'), Math.floor(Date.now() / 1000)))) {
    return new Response('invalid signature', { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const key = env('STRIPE_SECRET_KEY');
  const prices: PriceIds = { monthly: env('STRIPE_PRICE_MONTHLY'), yearly: env('STRIPE_PRICE_YEARLY'), lifetime: env('STRIPE_PRICE_LIFETIME') };
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const save = async (row: EntitlementRow) => {
    const { error } = await db.from('entitlements').upsert(row, { onConflict: 'stripe_ref' });
    if (error) throw new Error(error.message);
  };
  const userForCustomer = async (customer: unknown): Promise<string | null> => {
    const id = typeof customer === 'string' ? customer : (customer as { id?: string } | null)?.id;
    if (!id) return null;
    const { data } = await db.from('billing_customers').select('user_id').eq('stripe_customer_id', id).maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  };
  // Toujours relire l'abonnement : les événements Stripe peuvent arriver dans le désordre.
  const syncSubscription = async (subscriptionId: string, userId: string | null) => {
    const sub = await stripeApi<StripeSubscription>(key, `subscriptions/${subscriptionId}`);
    const owner = sub.metadata?.user_id ?? userId ?? (await userForCustomer(sub.customer));
    if (!owner) return console.warn(`Abonnement ${sub.id} sans compte Dollo associé`);
    const row = entitlementFromSubscription(sub, owner, prices);
    if (row) await save(row);
  };

  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = obj as unknown as StripeCheckoutSession;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        if (session.mode === 'subscription' && session.subscription) {
          await syncSubscription(typeof session.subscription === 'string' ? session.subscription : session.subscription.id, userId);
        } else if (userId) {
          const row = entitlementFromLifetime(session, userId);
          if (row) await save(row);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await syncSubscription(obj.id as string, (obj.metadata as Record<string, string> | undefined)?.user_id ?? null);
        break;
      case 'charge.refunded': {
        // Achat à vie remboursé en totalité : Dollo+ est retiré.
        if (!obj.refunded || !obj.payment_intent) break;
        const sessions = await stripeApi<{ data: { id: string }[] }>(key, 'checkout/sessions', { payment_intent: String(obj.payment_intent) }, 'GET');
        for (const s of sessions.data) {
          const { error } = await db.from('entitlements').update({ status: 'refunded' }).eq('stripe_ref', s.id).eq('plan', 'lifetime');
          if (error) throw new Error(error.message);
        }
        break;
      }
    }
  } catch (e) {
    // 500 : Stripe renverra l'événement plus tard (jusqu'à 3 jours).
    console.error(event.type, e);
    return new Response('error', { status: 500 });
  }
  return Response.json({ received: true });
});
