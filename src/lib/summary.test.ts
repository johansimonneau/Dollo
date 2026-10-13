import { describe, expect, it } from 'vitest';
import { dailySeries, groupByDay, lastOf, ongoing, suggestNextSide, summarizeDay } from './summary';
import { emptyEvent, type BabyEvent } from './types';
import { HOUR, MINUTE } from './time';

let n = 0;
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
function ev(partial: Partial<BabyEvent> & Pick<BabyEvent, 'kind' | 'startedAt'>): BabyEvent {
  return { ...emptyEvent('b1', partial.kind, partial.startedAt), id: `e${n++}`, ...partial };
}

describe('suggestNextSide', () => {
  it('renvoie null sans tétée', () => {
    expect(suggestNextSide([])).toBeNull();
    expect(suggestNextSide([ev({ kind: 'diaper', startedAt: at(13, 8), diaperType: 'pee' })])).toBeNull();
  });

  it("propose l'opposé de la dernière tétée, quel que soit l'ordre du tableau", () => {
    const events = [
      ev({ kind: 'breast', startedAt: at(13, 10), side: 'right' }),
      ev({ kind: 'breast', startedAt: at(13, 12), side: 'left' }),
      ev({ kind: 'breast', startedAt: at(13, 8), side: 'left' }),
    ];
    expect(suggestNextSide(events)).toBe('right');
  });
});

describe('lastOf / ongoing', () => {
  it('trouve le dernier événement du type demandé', () => {
    const events = [
      ev({ kind: 'diaper', startedAt: at(13, 7), diaperType: 'pee' }),
      ev({ kind: 'diaper', startedAt: at(13, 9), diaperType: 'poop' }),
      ev({ kind: 'bottle', startedAt: at(13, 10), amountMl: 90 }),
    ];
    expect(lastOf(events, 'diaper')?.diaperType).toBe('poop');
    expect(lastOf(events, 'sleep')).toBeNull();
  });

  it('ne liste que les tétées / siestes sans heure de fin', () => {
    const events = [
      ev({ kind: 'breast', startedAt: at(13, 9), side: 'left', endedAt: at(13, 9, 20) }),
      ev({ kind: 'breast', startedAt: at(13, 11), side: 'right' }),
      ev({ kind: 'sleep', startedAt: at(13, 10) }),
      ev({ kind: 'bottle', startedAt: at(13, 12), amountMl: 60 }),
    ];
    expect(ongoing(events).map((e) => e.kind)).toEqual(['sleep', 'breast']);
  });
});

describe('summarizeDay', () => {
  const now = new Date(2026, 9, 13, 18, 0).getTime();

  it('compte tétées, biberons et couches', () => {
    const events = [
      ev({ kind: 'breast', startedAt: at(13, 8), endedAt: at(13, 8, 15), side: 'left' }),
      ev({ kind: 'breast', startedAt: at(13, 8, 15), endedAt: at(13, 8, 25), side: 'right' }),
      ev({ kind: 'bottle', startedAt: at(13, 12), amountMl: 80 }),
      ev({ kind: 'bottle', startedAt: at(13, 15), amountMl: 100 }),
      ev({ kind: 'diaper', startedAt: at(13, 9), diaperType: 'pee' }),
      ev({ kind: 'diaper', startedAt: at(13, 11), diaperType: 'both' }),
      ev({ kind: 'diaper', startedAt: at(13, 14), diaperType: 'poop' }),
      ev({ kind: 'diaper', startedAt: at(12, 23), diaperType: 'pee' }), // veille : ignorée
    ];
    const s = summarizeDay(events, '2026-10-13', now);
    expect(s.breastCount).toBe(2);
    expect(s.breastMs).toBe(25 * MINUTE);
    expect(s.bottleCount).toBe(2);
    expect(s.bottleMl).toBe(180);
    expect(s.diaperCount).toBe(3);
    expect(s.pee).toBe(2); // pee + both
    expect(s.poop).toBe(2); // both + poop
  });

  it('répartit une nuit à cheval sur minuit entre les deux jours', () => {
    const night = ev({ kind: 'sleep', startedAt: at(12, 22), endedAt: at(13, 6) });
    const day12 = summarizeDay([night], '2026-10-12', now);
    const day13 = summarizeDay([night], '2026-10-13', now);
    expect(day12.sleepMs).toBe(2 * HOUR);
    expect(day13.sleepMs).toBe(6 * HOUR);
    expect(day12.sleepCount).toBe(1); // compté le jour où il commence
    expect(day13.sleepCount).toBe(0);
  });

  it("compte un sommeil en cours jusqu'à maintenant", () => {
    const s = summarizeDay([ev({ kind: 'sleep', startedAt: at(13, 16, 30) })], '2026-10-13', now);
    expect(s.sleepMs).toBe(90 * MINUTE);
  });

  it('ne compte pas un biberon sans quantité dans les ml', () => {
    const s = summarizeDay([ev({ kind: 'bottle', startedAt: at(13, 12) })], '2026-10-13', now);
    expect(s.bottleCount).toBe(1);
    expect(s.bottleMl).toBe(0);
  });
});

describe('dailySeries', () => {
  it("renvoie N jours, aujourd'hui en dernier", () => {
    const now = new Date(2026, 9, 13, 18, 0).getTime();
    const series = dailySeries([], 7, now);
    expect(series).toHaveLength(7);
    expect(series[0].key).toBe('2026-10-07');
    expect(series[6].key).toBe('2026-10-13');
  });
});

describe('groupByDay', () => {
  it('regroupe par jour local en gardant l\'ordre du plus récent au plus ancien', () => {
    const events = [
      ev({ kind: 'bottle', startedAt: at(13, 18), amountMl: 90 }),
      ev({ kind: 'bottle', startedAt: at(13, 9), amountMl: 60 }),
      ev({ kind: 'bottle', startedAt: at(12, 23, 30), amountMl: 120 }), // 23h30 appartient au 12
      ev({ kind: 'bottle', startedAt: at(11, 7), amountMl: 100 }),
    ];
    const groups = groupByDay(events);
    expect(groups.map((g) => g.key)).toEqual(['2026-10-13', '2026-10-12', '2026-10-11']);
    expect(groups.map((g) => g.events.length)).toEqual([2, 1, 1]);
  });

  it('renvoie une liste vide sans événement', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
