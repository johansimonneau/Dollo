import { describe, expect, it } from 'vitest';
import { daysLeft, giftNudge, toBilling, unlocked, UNLOCKED, type BillingStatus } from './billing';

const NOW = new Date('2026-10-15T10:00:00Z').getTime();
const DAY = 86_400_000;
const status = (over: Partial<BillingStatus>): BillingStatus => ({ ...toBilling({}), ...over });

describe('Dollo+ : ce qui est ouvert', () => {
  it('tout est ouvert en mode local ou sans la migration', () => {
    expect(unlocked(UNLOCKED, 'nanny', 'b1')).toBe(true);
    expect(unlocked(UNLOCKED, 'babies', null)).toBe(true);
  });

  it("un bébé couvert par l'abonnement de l'autre parent débloque ses fonctions, pas les bébés supplémentaires", () => {
    const b = status({ premium: false, premiumBabyIds: ['b1'] });
    expect(unlocked(b, 'report', 'b1')).toBe(true);
    expect(unlocked(b, 'report', 'b2')).toBe(false);
    expect(unlocked(b, 'babies', 'b1')).toBe(false);
  });

  it('compte gratuit : tout est verrouillé', () => {
    const b = status({});
    for (const f of ['nanny', 'push', 'report', 'growth', 'milk', 'babies', 'export'] as const) expect(unlocked(b, f, 'b1')).toBe(false);
  });

  it('lit la réponse de billing_status()', () => {
    expect(toBilling({ premium: true, plan: 'yearly', status: 'active', period_end: '2027-10-15T00:00:00Z', cancel_at_period_end: true, premium_baby_ids: ['b1'] })).toEqual({
      enforced: true,
      premium: true,
      plan: 'yearly',
      status: 'active',
      periodEnd: '2027-10-15T00:00:00Z',
      cancelAtPeriodEnd: true,
      premiumBabyIds: ['b1'],
    });
  });
});

describe('Dollo+ : bandeau de fin de période offerte', () => {
  const gift = (endInDays: number, premium = endInDays > 0) =>
    status({ premium, plan: 'gift', status: 'active', periodEnd: new Date(NOW + endInDays * DAY).toISOString() });

  it('rien tant qu’il reste plus de 5 jours', () => expect(giftNudge(gift(10), NOW)).toBeNull());
  it('compte à rebours sur les 5 derniers jours', () => {
    expect(giftNudge(gift(5), NOW)).toEqual({ kind: 'ending', days: 5 });
    expect(giftNudge(gift(0.2), NOW)).toEqual({ kind: 'ending', days: 1 });
  });
  it('période terminée : relance pendant 30 jours, puis plus rien', () => {
    expect(giftNudge(gift(-3), NOW)).toEqual({ kind: 'ended' });
    expect(giftNudge(gift(-40), NOW)).toBeNull();
  });
  it('jamais pour un abonné ou à vie', () => {
    expect(giftNudge(status({ premium: true, plan: 'monthly', periodEnd: new Date(NOW + 3 * DAY).toISOString() }), NOW)).toBeNull();
    expect(giftNudge(status({ premium: true, plan: 'lifetime' }), NOW)).toBeNull();
  });
  it('jours restants arrondis au-dessus', () => expect(daysLeft(gift(2.5), NOW)).toBe(3));
});
