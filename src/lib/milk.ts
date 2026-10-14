import type { MilkBag } from './types';

/**
 * Durées de conservation du lait maternel tiré (repères prudents les plus courants en France ; les consignes de la
 * maternité ou du pédiatre priment) :
 * - réfrigérateur (0–4 °C, au fond, pas dans la porte) : 48 h ;
 * - congélateur (−18 °C) : 4 mois ;
 * - décongelé au réfrigérateur : 24 h, ne jamais recongeler.
 */
export const MILK_RULES = { fridgeHours: 48, freezerMonths: 4, thawedHours: 24 } as const;

const HOUR = 3_600_000;

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}

/** Date limite d'utilisation (ms) selon le stockage actuel. */
export function expiresAt(bag: Pick<MilkBag, 'storage' | 'storedAt'>): number {
  const start = new Date(bag.storedAt).getTime();
  if (bag.storage === 'freezer') return addMonths(start, MILK_RULES.freezerMonths);
  return start + (bag.storage === 'thawed' ? MILK_RULES.thawedHours : MILK_RULES.fridgeHours) * HOUR;
}

export type MilkStatus = 'ok' | 'soon' | 'expired';

/** « soon » : moins de 12 h au réfrigérateur / décongelé, moins de 14 jours au congélateur. */
export function milkStatus(bag: Pick<MilkBag, 'storage' | 'storedAt'>, nowMs: number): MilkStatus {
  const left = expiresAt(bag) - nowMs;
  if (left <= 0) return 'expired';
  const soon = bag.storage === 'freezer' ? 14 * 24 * HOUR : 12 * HOUR;
  return left <= soon ? 'soon' : 'ok';
}

/** Sachets encore disponibles, du premier à utiliser au dernier (le plus proche de sa date limite d'abord). */
export function activeBags(bags: MilkBag[]): MilkBag[] {
  return bags.filter((b) => !b.usedAt && !b.discardedAt).sort((a, b) => expiresAt(a) - expiresAt(b));
}

export function stockTotals(bags: MilkBag[], nowMs: number) {
  const usable = activeBags(bags).filter((b) => milkStatus(b, nowMs) !== 'expired');
  const sum = (s: MilkBag['storage'][]) => usable.filter((b) => s.includes(b.storage));
  const fridge = sum(['fridge', 'thawed']);
  const freezer = sum(['freezer']);
  return {
    fridgeMl: fridge.reduce((t, b) => t + b.volumeMl, 0),
    fridgeCount: fridge.length,
    freezerMl: freezer.reduce((t, b) => t + b.volumeMl, 0),
    freezerCount: freezer.length,
  };
}
