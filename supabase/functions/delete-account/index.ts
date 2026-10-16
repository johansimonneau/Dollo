// Suppression du compte de l'utilisateur connecté (JWT vérifié par Supabase), depuis Réglages → Compte.
//   POST { confirm: 'SUPPRIMER' }  → { deleted: true }
// Ordre : paiement Stripe résilié, bébés partagés transmis à l'autre parent, puis compte supprimé (voir _shared/account.ts).
//   supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DELETE_CONFIRMATION, deleteAccount, isMissingStripeCustomer } from '../_shared/account.ts';
import { stripeApi } from '../_shared/stripe.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'not_authenticated' }, 401);

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== DELETE_CONFIRMATION) return json({ error: 'confirmation_required' }, 400);

  try {
    await deleteAccount({
      async stripeCustomerId() {
        const { data, error } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
        if (error) throw new Error(error.message);
        return (data?.stripe_customer_id as string | undefined) ?? null;
      },
      async deleteStripeCustomer(id) {
        // Sans clé Stripe on ne peut pas arrêter les prélèvements : on ne supprime rien.
        if (!env('STRIPE_SECRET_KEY')) throw new Error('billing_not_configured');
        try {
          await stripeApi(env('STRIPE_SECRET_KEY'), `customers/${id}`, undefined, 'DELETE');
        } catch (e) {
          if (!isMissingStripeCustomer((e as Error).message)) throw e;
        }
      },
      async transferBabies() {
        const { error } = await db.rpc('prepare_account_deletion', { p_user_id: user.id });
        if (error) throw new Error(error.message);
      },
      async deleteUser() {
        const { error } = await db.auth.admin.deleteUser(user.id);
        if (error) throw new Error(error.message);
      },
    });
  } catch (e) {
    console.error('delete-account', user.id, e);
    return json({ error: 'delete_failed' }, 502);
  }
  return json({ deleted: true });
});
