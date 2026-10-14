export type EventKind = 'breast' | 'bottle' | 'diaper' | 'sleep' | 'temp' | 'med';
export type BreastSide = 'left' | 'right';
export type DiaperType = 'pee' | 'poop' | 'both';

/** Rôle sur un bébé : « owner » a créé le suivi ; la nounou n'a qu'un accès restreint (voir migration 0005). */
export type Role = 'owner' | 'parent' | 'nanny';
export type InviteRole = 'parent' | 'nanny';

export interface Baby {
  id: string;
  name: string;
  /** Date de naissance au format YYYY-MM-DD, ou null. */
  birthDate: string | null;
  /** Code à partager avec l'autre parent (mode cloud uniquement). */
  inviteCode?: string;
  createdAt: string;
  /** Rôle de l'utilisateur connecté (mode cloud). Absent = accès complet. */
  role?: Role;
  /** Sexe (courbes de croissance OMS). null / absent = non renseigné. */
  sex?: 'f' | 'm' | null;
}

/** Mesure de croissance (poids en grammes, tailles en millimètres : pas d'arrondi flottant en base). */
export interface Measurement {
  id: string;
  babyId: string;
  /** YYYY-MM-DD */
  measuredOn: string;
  weightG: number | null;
  lengthMm: number | null;
  headMm: number | null;
  note: string | null;
}
export type NewMeasurement = Omit<Measurement, 'id'>;

/** Dose de vaccin notée comme faite (code : voir lib/vaccines.ts). */
export interface Vaccination {
  id: string;
  babyId: string;
  code: string;
  /** YYYY-MM-DD */
  givenOn: string;
  note: string | null;
}

/** Personne ayant accès au suivi d'un bébé. */
export interface Member {
  userId: string;
  email: string;
  /** « owner » : a créé le suivi, peut retirer les autres. */
  role: Role;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  babyId: string;
  /** Adresse invitée, toujours en minuscules. */
  email: string;
  createdAt: string;
  expiresAt: string;
  /** Renseigné quand la personne a rejoint le bébé. */
  acceptedAt: string | null;
  role: InviteRole;
}

export interface BabyEvent {
  id: string;
  babyId: string;
  kind: EventKind;
  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601, ou null tant que la tétée / le sommeil est en cours. */
  endedAt: string | null;
  side: BreastSide | null;
  /** Biberon : quantité réellement BUE par bébé (pas la quantité préparée). */
  amountMl: number | null;
  diaperType: DiaperType | null;
  /** Température en °C (événement « temp »). */
  tempC?: number | null;
  /** Médicament (événement « med ») : nom et dose libre (« 2,4 ml », « 1 goutte »). */
  medName?: string | null;
  medDose?: string | null;
  note: string | null;
  /** Auteur (mode cloud). Rempli par la base, jamais envoyé par l'app. */
  createdBy?: string | null;
}

export type NewEvent = Omit<BabyEvent, 'id'>;

export const emptyEvent = (babyId: string, kind: EventKind, startedAt: string): NewEvent => ({
  babyId,
  kind,
  startedAt,
  endedAt: null,
  side: null,
  amountMl: null,
  diaperType: null,
  note: null,
});
