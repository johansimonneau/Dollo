import type { ReminderPrefs } from '../../supabase/functions/_shared/reminders';
import type { Baby, BabyEvent, Invitation, InviteRole, Measurement, Member, MilkBag, NewEvent, NewMeasurement, NewMilkBag, Vaccination } from '../lib/types';

/** Abonnement Web Push d'un appareil (PushSubscription.toJSON()). */
export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface BabyInput {
  name: string;
  birthDate: string | null;
  /** Transmis seulement s'il est renseigné (compatibilité avec une base sans la migration 0007). */
  sex?: 'f' | 'm' | null;
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
  inviteParent(babyId: string, email: string, role?: InviteRole): Promise<Invitation>;
  cancelInvitation(id: string): Promise<void>;
  /** Personnes ayant accès au bébé (propriétaire en premier). */
  listMembers(babyId: string): Promise<Member[]>;
  /** Retire un parent (propriétaire uniquement) ; le code d'invitation est renouvelé. */
  removeMember(babyId: string, userId: string): Promise<void>;
  /** À appeler à la connexion : rejoint les bébés pour lesquels l'adresse de l'utilisateur a été invitée. */
  acceptInvitations(): Promise<Baby[]>;
  /** Réglages de rappels de l'utilisateur pour ce bébé (valeurs par défaut s'il n'en a pas). */
  getReminderPrefs(babyId: string): Promise<ReminderPrefs>;
  saveReminderPrefs(babyId: string, prefs: ReminderPrefs, timeZone: string): Promise<void>;
  /** Enregistre l'appareil pour recevoir les notifications (cloud uniquement). */
  savePushSubscription(sub: PushSubscriptionData): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  /** Mesures de croissance (parents uniquement), de la plus ancienne à la plus récente. */
  listMeasurements(babyId: string): Promise<Measurement[]>;
  addMeasurement(m: NewMeasurement): Promise<Measurement>;
  updateMeasurement(id: string, patch: Partial<NewMeasurement>): Promise<Measurement>;
  deleteMeasurement(id: string): Promise<void>;
  /** Vaccins notés (parents uniquement). */
  listVaccinations(babyId: string): Promise<Vaccination[]>;
  /** Note une dose comme faite (ou corrige sa date / sa note). */
  saveVaccination(babyId: string, code: string, givenOn: string, note: string | null): Promise<Vaccination>;
  deleteVaccination(id: string): Promise<void>;
  /** Stock de lait tiré encore disponible (ni utilisé ni jeté). */
  listMilkBags(babyId: string): Promise<MilkBag[]>;
  addMilkBag(bag: NewMilkBag): Promise<MilkBag>;
  /** Décongeler, utiliser, jeter, corriger le volume… */
  updateMilkBag(id: string, patch: Partial<Pick<MilkBag, 'volumeMl' | 'storage' | 'storedAt' | 'usedAt' | 'discardedAt' | 'note'>>): Promise<MilkBag>;
  listEvents(babyId: string, sinceIso: string): Promise<BabyEvent[]>;
  /** `id` : identifiant choisi par l'appareil (saisie hors ligne rejouée plus tard sans doublon). */
  addEvent(event: NewEvent, id?: string): Promise<BabyEvent>;
  updateEvent(id: string, patch: Partial<NewEvent>): Promise<BabyEvent>;
  deleteEvent(id: string): Promise<void>;
  /** Appelle `onChange` quand les données ont changé ailleurs (autre parent, autre onglet). */
  subscribe(babyId: string, onChange: () => void): () => void;
}

export class StoreError extends Error {}

/** Pas de réseau (ou serveur injoignable) : l'action peut être rejouée plus tard sans risque. */
export class NetworkError extends StoreError {
  constructor() {
    super('Pas de connexion. Vos saisies sont gardées sur le téléphone et partiront au retour du réseau.');
  }
}

/** Erreur d'un `fetch` qui n'a pas abouti, selon les navigateurs (Chrome, Safari, Firefox). */
export function isNetworkFailure(message: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message) || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Une erreur est survenue.';
}
