export type EventKind = 'breast' | 'bottle' | 'diaper' | 'sleep';
export type BreastSide = 'left' | 'right';
export type DiaperType = 'pee' | 'poop' | 'both';

export interface Baby {
  id: string;
  name: string;
  /** Date de naissance au format YYYY-MM-DD, ou null. */
  birthDate: string | null;
  /** Code à partager avec l'autre parent (mode cloud uniquement). */
  inviteCode?: string;
  createdAt: string;
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
  amountMl: number | null;
  diaperType: DiaperType | null;
  note: string | null;
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
