// Appel de l'API Stripe sans SDK (fetch + x-www-form-urlencoded). La clé secrète ne vit que dans les secrets des fonctions.

const formBody = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** Version d'API figée : le format des réponses ne change pas avec les réglages du compte Stripe. */
export const STRIPE_API_VERSION = '2026-08-26.dahlia';

export async function stripeApi<T = Record<string, unknown>>(
  secretKey: string,
  path: string,
  params?: Record<string, string>,
  method: 'GET' | 'POST' | 'DELETE' = params ? 'POST' : 'GET',
): Promise<T> {
  const query = method === 'GET' && params ? `?${formBody(params)}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
    },
    body: method === 'POST' && params ? formBody(params) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Stripe : erreur ${res.status}`);
  return body as T;
}
