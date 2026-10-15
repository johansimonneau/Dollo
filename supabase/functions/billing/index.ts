// Dollo+ : ouvre le paiement Stripe Checkout (abonnement ou achat à vie) ou le portail client (gérer / résilier).
// Appelée par l'app connectée (JWT vérifié par Supabase). L'activation de Dollo+ est faite par billing-webhook.
//   POST { action: 'checkout', plan: 'monthly' | 'yearly' | 'lifetime' }  → { url }
//   POST { action: 'portal' }                                           → { url }
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { checkoutParams, PAID_PLANS, resolveAppUrl, type PaidPlan } from '../_shared/billing.ts';
import { stripeApi } from '../_shared/stripe.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

const ACTIVE = ['active', 'trialing', 'past_due'];

/** Client Stripe du compte : réutilisé d'un paiement à l'autre (historique, portail, moyens de paiement). */
async function customerFor(db: SupabaseClient, user: User): Promise<string> {
  const { data } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (data) return data.stripe_customer_id as string;
  const created = await stripeApi<{ id: string }>(env('STRIPE_SECRET_KEY'), 'customers', { email: user.email ?? '', 'metadata[user_id]': user.id });
  const { error } = await db.from('billing_customers').insert({ user_id: user.id, stripe_customer_id: created.id });
  if (!error) return created.id;
  // Deux appels simultanés : on garde celui qui a été enregistré en premier.
  const again = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', user.id).single();
  if (again.error) throw new Error(again.error.message);
  return again.data.stripe_customer_id as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env('STRIPE_SECRET_KEY')) return json({ error: 'billing_not_configured' }, 503);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'not_authenticated' }, 401);

  const appUrl = resolveAppUrl(env('APP_URL'), req.headers.get('Origin'));
  if (!appUrl) return json({ error: 'app_url_missing' }, 400);
  const body = (await req.json().catch(() => ({}))) as { action?: string; plan?: string };

  try {
    if (body.action === 'portal') {
      const { data } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
      if (!data) return json({ error: 'no_customer' }, 404);
      const portal = await stripeApi<{ url: string }>(env('STRIPE_SECRET_KEY'), 'billing_portal/sessions', {
        customer: data.stripe_customer_id as string,
        return_url: `${appUrl}/?app`,
      });
      return json({ url: portal.url });
    }

    const plan = body.plan as PaidPlan;
    if (!PAID_PLANS.includes(plan)) return json({ error: 'invalid_plan' }, 400);
    const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}`);
    if (!priceId) return json({ error: 'billing_not_configured' }, 503);

    // Déjà abonné ou à vie : pas de second paiement (le portail sert à changer de formule).
    const { data: paid } = await db.from('entitlements').select('status, current_period_end').eq('user_id', user.id).neq('plan', 'gift');
    const now = Date.now();
    if ((paid ?? []).some((e) => ACTIVE.includes(e.status) && (!e.current_period_end || new Date(e.current_period_end).getTime() > now))) {
      return json({ error: 'already_premium' }, 409);
    }

    const session = await stripeApi<{ url: string }>(
      env('STRIPE_SECRET_KEY'),
      'checkout/sessions',
      checkoutParams({
        plan,
        priceId,
        customer: await customerFor(db, user),
        userId: user.id,
        appUrl,
        // Essai gratuit (facultatif) : seulement pour un premier abonnement.
        trialDays: (paid ?? []).length === 0 ? Number(env('STRIPE_TRIAL_DAYS')) || 0 : 0,
      }),
    );
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 502);
  }
});
