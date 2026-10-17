// Suppression de compte : l'ordre des étapes, isolé du réseau pour être testé (src/lib/accountServer.test.ts).

/** Mot à recopier dans l'app pour confirmer : un appel accidentel (ou un vieux client) ne supprime rien. */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

export interface AccountDeletionSteps {
  /** Client Stripe du compte, s'il a déjà payé ou ouvert un paiement. */
  stripeCustomerId(): Promise<string | null>;
  /** Supprime le client Stripe : tous ses abonnements sont résiliés immédiatement, sans autre prélèvement. */
  deleteStripeCustomer(id: string): Promise<void>;
  /** Transmet les bébés partagés à l'autre parent (prepare_account_deletion, migration 0012). */
  transferBabies(): Promise<void>;
  /** Supprime le compte ; la base supprime le reste en cascade. */
  deleteUser(): Promise<void>;
}

/**
 * Le paiement est arrêté AVANT toute suppression : si Stripe échoue, rien n'est supprimé et la personne peut
 * réessayer (jamais un compte supprimé qui continue d'être prélevé). Chaque étape peut être rejouée sans risque.
 */
export async function deleteAccount(steps: AccountDeletionSteps): Promise<void> {
  const customer = await steps.stripeCustomerId();
  if (customer) await steps.deleteStripeCustomer(customer);
  await steps.transferBabies();
  await steps.deleteUser();
}

/** Client déjà supprimé chez Stripe (nouvel essai après un échec plus loin) : l'étape est faite. */
export const isMissingStripeCustomer = (message: string) => /no such customer/i.test(message);
