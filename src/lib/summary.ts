import type { BabyEvent, BreastSide, EventKind } from './types';
import { dayBounds, dayKey, shiftDay } from './time';

export interface Summary {
  breastCount: number;
  breastMs: number;
  bottleCount: number;
  bottleMl: number;
  diaperCount: number;
  pee: number;
  poop: number;
  sleepMs: number;
  sleepCount: number;
  tempCount: number;
  /** Température la plus haute de la fenêtre, ou null. */
  tempMax: number | null;
  medCount: number;
}

const overlap = (start: number, end: number, winStart: number, winEnd: number) =>
  Math.max(0, Math.min(end, winEnd) - Math.max(start, winStart));

/**
 * Résume les événements dans la fenêtre [winStart, winEnd[.
 * - les compteurs se basent sur l'heure de début ;
 * - les durées (tétée, sommeil) sont tronquées à la fenêtre : une nuit à cheval sur minuit
 *   est répartie sur les deux jours ; un événement en cours compte jusqu'à `nowMs`.
 */
export function summarize(events: BabyEvent[], winStart: number, winEnd: number, nowMs: number): Summary {
  const s: Summary = {
    breastCount: 0,
    breastMs: 0,
    bottleCount: 0,
    bottleMl: 0,
    diaperCount: 0,
    pee: 0,
    poop: 0,
    sleepMs: 0,
    sleepCount: 0,
    tempCount: 0,
    tempMax: null,
    medCount: 0,
  };
  for (const e of events) {
    const start = new Date(e.startedAt).getTime();
    const end = e.endedAt ? new Date(e.endedAt).getTime() : nowMs;
    const startsInside = start >= winStart && start < winEnd;
    switch (e.kind) {
      case 'breast':
        if (startsInside) s.breastCount += 1;
        s.breastMs += overlap(start, end, winStart, winEnd);
        break;
      case 'bottle':
        if (startsInside) {
          s.bottleCount += 1;
          s.bottleMl += e.amountMl ?? 0;
        }
        break;
      case 'diaper':
        if (startsInside) {
          s.diaperCount += 1;
          if (e.diaperType === 'pee' || e.diaperType === 'both') s.pee += 1;
          if (e.diaperType === 'poop' || e.diaperType === 'both') s.poop += 1;
        }
        break;
      case 'sleep':
        if (startsInside) s.sleepCount += 1;
        s.sleepMs += overlap(start, end, winStart, winEnd);
        break;
      case 'temp':
        if (startsInside && e.tempC != null) {
          s.tempCount += 1;
          s.tempMax = Math.max(s.tempMax ?? e.tempC, e.tempC);
        }
        break;
      case 'med':
        if (startsInside) s.medCount += 1;
        break;
    }
  }
  return s;
}

export function summarizeDay(events: BabyEvent[], key: string, nowMs: number): Summary {
  const [a, b] = dayBounds(key);
  return summarize(events, a, b, nowMs);
}

/** Dernier événement (par heure de début) d'un type donné. */
export function lastOf(events: BabyEvent[], kind: EventKind): BabyEvent | null {
  let best: BabyEvent | null = null;
  for (const e of events) {
    if (e.kind !== kind) continue;
    if (!best || new Date(e.startedAt) > new Date(best.startedAt)) best = e;
  }
  return best;
}

/** Sein à proposer ensuite : l'opposé de la dernière tétée. */
export function suggestNextSide(events: BabyEvent[]): BreastSide | null {
  const last = lastOf(events, 'breast');
  if (!last || !last.side) return null;
  return last.side === 'left' ? 'right' : 'left';
}

/** Événements en cours (tétée ou sommeil sans heure de fin). */
export function ongoing(events: BabyEvent[]): BabyEvent[] {
  return events
    .filter((e) => (e.kind === 'breast' || e.kind === 'sleep') && e.endedAt === null)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}

/** Résumés des `days` derniers jours, du plus ancien au plus récent (aujourd'hui en dernier). */
export function dailySeries(events: BabyEvent[], days: number, nowMs: number): { key: string; summary: Summary }[] {
  const today = dayKey(nowMs);
  const out: { key: string; summary: Summary }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = shiftDay(today, -i);
    out.push({ key, summary: summarizeDay(events, key, nowMs) });
  }
  return out;
}

/** Regroupe des événements déjà triés (du plus récent au plus ancien) par jour de début, en gardant l'ordre. */
export function groupByDay(events: BabyEvent[]): { key: string; events: BabyEvent[] }[] {
  const groups: { key: string; events: BabyEvent[] }[] = [];
  for (const e of events) {
    const key = dayKey(e.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(e);
    else groups.push({ key, events: [e] });
  }
  return groups;
}
