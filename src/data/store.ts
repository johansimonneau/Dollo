import type { Baby, BabyEvent, Invitation, Member, NewEvent } from '../lib/types';

export interface BabyInput {
  name: string;
  birthDate: string | null;
}

/**
 * Contrat de stockage. Deux implémentations :
 * - `localStore` : tout reste sur l'appareil (aucun compte requis) ;
 * - `supabaseStore` : base partagée entre les parents, protégée par la RLS.
 */
export interface Store {
  mode: 'local' | 'cloud';
  listBabies(): Promise<Baby[]>;
  createBaby(input: BabyInput): Promise<Baby>;
  updateBaby(id: string, input: BabyInput): Promise<Baby>;
  /** Rejoint un bébé existant avec le code d'invitation de l'autre parent (cloud uniquement). */
  joinBaby(code: string): Promise<Baby>;
  /** Invalide l'ancien code d'invitation et en renvoie un nouveau (propriétaire uniquement). */
  regenerateInviteCode(babyId: string): Promise<string>;
  /** Invitations envoyées pour ce bébé (en attente, expirées, acceptées). */
  listInvitations(babyId: string): Promise<Invitation[]>;
  /**
   * Enregistre l'invitation d'une adresse. Aucun e-mail n'est envoyé : l'app partage un lien, la personne crée son compte
   * (avec mot de passe) avec cette adresse et rejoint le bébé dès sa première connexion.
   */
  inviteParent(babyId: string, email: string): Promise<Invitation>;
  cancelInvitation(id: string): Promise<void>;
  /** Personnes ayant accès au bébé (propriétaire en premier). */
  listMembers(babyId: string): Promise<Member[]>;
  /** Retire un parent (propriétaire uniquement) ; le code d'invitation est renouvelé. */
  removeMember(babyId: string, userId: string): Promise<void>;
  /** À appeler à la connexion : rejoint les bébés pour lesquels l'adresse de l'utilisateur a été invitée. */
  acceptInvitations(): Promise<Baby[]>;
  listEvents(babyId: string, sinceIso: string): Promise<BabyEvent[]>;
  addEvent(event: NewEvent): Promise<BabyEvent>;
  updateEvent(id: string, patch: Partial<NewEvent>): Promise<BabyEvent>;
  deleteEvent(id: string): Promise<void>;
  /** Appelle `onChange` quand les données ont changé ailleurs (autre parent, autre onglet). */
  subscribe(babyId: string, onChange: () => void): () => void;
}

export class StoreError extends Error {}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Une erreur est survenue.';
}
