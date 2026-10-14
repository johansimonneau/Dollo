import { describe, expect, it } from 'vitest';
import { ageInMonths, fmtPercentile, lmsAt, normalCdf, percentile, valueAtZ } from './growth';

describe('croissance (standards OMS)', () => {
  it('retrouve les percentiles publiés par l’OMS (garçon, poids, naissance et 1 mois)', () => {
    // valeurs des colonnes 2nd (z = -2), 50th et 98th (z = +2) des tables officielles
    expect(valueAtZ(lmsAt('weight', 'm', 0)!, 0)).toBeCloseTo(3.3464, 4);
    expect(valueAtZ(lmsAt('weight', 'm', 1)!, -2)).toBeCloseTo(3.39089, 3);
    expect(valueAtZ(lmsAt('weight', 'm', 1)!, 2)).toBeCloseTo(5.798331, 3);
    expect(valueAtZ(lmsAt('weight', 'f', 0)!, 2)).toBeCloseTo(4.23043, 3);
    expect(valueAtZ(lmsAt('head', 'f', 0)!, -2)).toBeCloseTo(31.5099, 3);
  });

  it('percentile : la médiane donne le 50e, et la fonction est cohérente', () => {
    expect(percentile('length', 'f', 24, 86.4153)).toBeCloseTo(50, 1);
    expect(percentile('weight', 'm', 1, 3.39089)).toBeCloseTo(2.28, 1); // z = -2
    expect(normalCdf(1.880794)).toBeCloseTo(0.97, 3);
  });

  it('interpole entre deux mois et refuse hors 0–24 mois', () => {
    const mid = lmsAt('weight', 'm', 0.5)![1];
    expect(mid).toBeGreaterThan(3.3464);
    expect(mid).toBeLessThan(4.4709);
    expect(lmsAt('weight', 'm', 25)).toBeNull();
    expect(percentile('weight', 'm', -1, 3)).toBeNull();
  });

  it('âge en mois et formulation', () => {
    expect(ageInMonths('2026-01-01', '2026-01-01')).toBe(0);
    expect(ageInMonths('2026-01-01', '2027-01-01')).toBeCloseTo(11.99, 1);
    expect(fmtPercentile(50.4)).toBe('50e percentile');
    expect(fmtPercentile(1.2)).toBe('1er percentile');
    expect(fmtPercentile(0.4)).toBe('< 1er percentile');
    expect(fmtPercentile(99.6)).toBe('> 99e percentile');
  });
});
