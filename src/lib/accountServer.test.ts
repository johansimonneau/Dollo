import { describe, expect, it } from 'vitest';
import { deleteAccount, isMissingStripeCustomer, type AccountDeletionSteps } from '../../supabase/functions/_shared/account';

function steps(overrides: Partial<AccountDeletionSteps> = {}) {
  const calls: string[] = [];
  const s: AccountDeletionSteps = {
    stripeCustomerId: async () => (calls.push('lookup'), 'cus_1'),
    deleteStripeCustomer: async (id) => void calls.push(`stripe:${id}`),
    transferBabies: async () => void calls.push('transfer'),
    deleteUser: async () => void calls.push('delete'),
    ...overrides,
  };
  return { s, calls };
}

describe('suppression de compte', () => {
  it('arrête le paiement, transmet les bébés partagés, puis supprime le compte', async () => {
    const { s, calls } = steps();
    await deleteAccount(s);
    expect(calls).toEqual(['lookup', 'stripe:cus_1', 'transfer', 'delete']);
  });

  it("sans client Stripe : pas d'appel à Stripe", async () => {
    const { s, calls } = steps({ stripeCustomerId: async () => null });
    await deleteAccount(s);
    expect(calls).toEqual(['transfer', 'delete']);
  });

  it("Stripe en échec : rien n'est supprimé (jamais un compte supprimé encore prélevé)", async () => {
    const { s, calls } = steps({
      deleteStripeCustomer: async () => {
        throw new Error('Stripe indisponible');
      },
    });
    await expect(deleteAccount(s)).rejects.toThrow('Stripe indisponible');
    expect(calls).toEqual(['lookup']);
  });

  it('transmission en échec : le compte est gardé', async () => {
    const { s, calls } = steps({
      transferBabies: async () => {
        throw new Error('base indisponible');
      },
    });
    await expect(deleteAccount(s)).rejects.toThrow();
    expect(calls).not.toContain('delete');
  });

  it('reconnaît un client Stripe déjà supprimé (nouvel essai)', () => {
    expect(isMissingStripeCustomer('No such customer: cus_1')).toBe(true);
    expect(isMissingStripeCustomer('Rate limit')).toBe(false);
  });
});
