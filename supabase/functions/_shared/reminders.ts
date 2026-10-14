// Logique des rappels, PARTAGÉE entre l'app (bandeaux sur « Aujourd'hui ») et la fonction serveur qui envoie les
// notifications (supabase/functions/send-reminders). Aucune dépendance : TypeScript pur, testé dans src/lib.

export interface ReminderPrefs {
  /** Rappel « repas » : minutes depuis le DÉBUT de la dernière tétée / du dernier biberon. null = désactivé. */
  feedEveryMin: number | null;
  /** Alerte « couche » : heures sans couche mouillée (pipi). null = désactivé. */
  diaperDryHours: number | null;
  /** Pas de notification entre 22 h et 7 h (heure locale). Les bandeaux dans l'app restent affichés. */
  quietNight: boolean;
}

export const DEFAULT_PREFS: ReminderPrefs = { feedEveryMin: null, diaperDryHours: null, quietNight: false };

export const FEED_CHOICES = [120, 150, 180, 210, 240] as const;
export const DIAPER_CHOICES = [4, 6, 8] as const;

export interface ReminderEvent {
  id: string;
  kind: 'breast' | 'bottle' | 'diaper' | 'sleep';
  startedAt: string;
  endedAt: string | null;
  diaperType: 'pee' | 'poop' | 'both' | null;
}

export interface DueReminder {
  kind: 'feed' | 'diaper';
  /** Événement de référence : on ne notifie qu'une fois par « dernier repas » / « dernière couche ». */
  refId: string;
  lastAt: string;
  /** Moment où le rappel est devenu dû. */
  dueAt: number;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

function latest(events: ReminderEvent[], keep: (e: ReminderEvent) => boolean): ReminderEvent | null {
  let best: ReminderEvent | null = null;
  for (const e of events) if (keep(e) && (!best || e.startedAt > best.startedAt)) best = e;
  return best;
}

/** Heure prévue du prochain rappel repas (pour « prochain repas vers 14h30 »), ou null. */
export function nextFeedAt(events: ReminderEvent[], prefs: ReminderPrefs): number | null {
  if (prefs.feedEveryMin == null) return null;
  const last = latest(events, (e) => e.kind === 'breast' || e.kind === 'bottle');
  if (!last) return null;
  if (last.kind === 'breast' && last.endedAt === null) return null; // tétée en cours
  return new Date(last.startedAt).getTime() + prefs.feedEveryMin * MINUTE;
}

/**
 * Rappels dus à `nowMs`. Sans événement de référence (bébé tout juste ajouté), rien n'est dû : on ne réveille pas
 * des parents pour un historique vide.
 */
export function dueReminders(events: ReminderEvent[], prefs: ReminderPrefs, nowMs: number): DueReminder[] {
  const due: DueReminder[] = [];

  const feedAt = nextFeedAt(events, prefs);
  if (feedAt !== null && nowMs >= feedAt) {
    const last = latest(events, (e) => e.kind === 'breast' || e.kind === 'bottle')!;
    due.push({ kind: 'feed', refId: last.id, lastAt: last.startedAt, dueAt: feedAt });
  }

  if (prefs.diaperDryHours != null) {
    const wet = latest(events, (e) => e.kind === 'diaper' && (e.diaperType === 'pee' || e.diaperType === 'both'));
    if (wet) {
      const at = new Date(wet.startedAt).getTime() + prefs.diaperDryHours * HOUR;
      if (nowMs >= at) due.push({ kind: 'diaper', refId: wet.id, lastAt: wet.startedAt, dueAt: at });
    }
  }
  return due;
}

/**
 * Un rappel dû depuis plus longtemps que ça n'est plus envoyé : le suivi a manifestement été mis en pause
 * (vacances chez les grands-parents, appli oubliée). On ne bombarde pas un téléphone avec un historique périmé.
 */
export const STALE_AFTER_MS = 12 * HOUR;

/** Rappels à NOTIFIER maintenant (les bandeaux de l'app, eux, affichent tout ce qui est dû). */
export function remindersToNotify(due: DueReminder[], prefs: ReminderPrefs, nowMs: number, hour: number): DueReminder[] {
  if (prefs.quietNight && isNight(hour)) return [];
  return due.filter((r) => nowMs - r.dueAt < STALE_AFTER_MS);
}

/** Heure locale (0–23) dans un fuseau donné, pour la plage de nuit. */
export function localHour(nowMs: number, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(nowMs));
    return Number(h);
  } catch {
    return new Date(nowMs).getHours();
  }
}

export const isNight = (hour: number) => hour >= 22 || hour < 7;

/** Texte de la notification (la même formulation dans l'app et sur l'écran verrouillé). */
export function reminderText(r: DueReminder, babyName: string, nowMs: number): { title: string; body: string } {
  const mins = Math.max(0, Math.round((nowMs - new Date(r.lastAt).getTime()) / MINUTE));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ago = h > 0 ? `${h} h${m > 0 ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
  return r.kind === 'feed'
    ? { title: `${babyName} : bientôt l'heure de manger`, body: `Dernier repas il y a ${ago}.` }
    : { title: `${babyName} : pas de couche mouillée depuis ${ago}`, body: 'Pensez à vérifier la couche et l’hydratation.' };
}
