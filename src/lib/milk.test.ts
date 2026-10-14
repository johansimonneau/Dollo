import { describe, expect, it } from 'vitest';
import { activeBags, expiresAt, milkStatus, stockTotals } from './milk';
import type { MilkBag } from './types';

const H = 3_600_000;
const now = new Date(2026, 9, 14, 12, 0).getTime();
const bag = (id: string, storage: MilkBag['storage'], storedAgoH: number, volumeMl = 100, extra: Partial<MilkBag> = {}): MilkBag => ({
  id, babyId: 'b', pumpedAt: new Date(now - storedAgoH * H).toISOString(), volumeMl, storage,
  storedAt: new Date(now - storedAgoH * H).toISOString(), usedAt: null, discardedAt: null, note: null, ...extra,
});

describe('stock de lait', () => {
  it('dates limites : 48 h au frigo, 24 h décongelé, 4 mois au congélateur', () => {
    expect(expiresAt(bag('a', 'fridge', 0))).toBe(now + 48 * H);
    expect(expiresAt(bag('b', 'thawed', 0))).toBe(now + 24 * H);
    expect(new Date(expiresAt(bag('c', 'freezer', 0))).getMonth()).toBe(1); // octobre + 4 mois = février
  });

  it('statut : bientôt (< 12 h frigo, < 14 j congélateur) puis périmé', () => {
    expect(milkStatus(bag('a', 'fridge', 10), now)).toBe('ok');
    expect(milkStatus(bag('a', 'fridge', 40), now)).toBe('soon');
    expect(milkStatus(bag('a', 'fridge', 49), now)).toBe('expired');
    expect(milkStatus(bag('b', 'thawed', 23), now)).toBe('soon');
    expect(milkStatus(bag('c', 'freezer', 24 * 110), now)).toBe('soon'); // ~3,6 mois
  });

  it("ordre d'utilisation : le plus proche de sa date limite d'abord ; utilisés et jetés exclus", () => {
    const bags = [bag('freezer', 'freezer', 1), bag('fridge-new', 'fridge', 1), bag('thawed', 'thawed', 1), bag('used', 'fridge', 30, 90, { usedAt: 'x' })];
    expect(activeBags(bags).map((b) => b.id)).toEqual(['thawed', 'fridge-new', 'freezer']);
  });

  it('totaux utilisables (le périmé ne compte pas)', () => {
    const bags = [bag('a', 'fridge', 1, 120), bag('b', 'thawed', 2, 80), bag('c', 'freezer', 5, 150), bag('d', 'fridge', 50, 999)];
    expect(stockTotals(bags, now)).toEqual({ fridgeMl: 200, fridgeCount: 2, freezerMl: 150, freezerCount: 1 });
  });
});
