import { PC_FILLE, PC_GARCON, POIDS_FILLE, POIDS_GARCON, TAILLE_FILLE, TAILLE_GARCON, type Lms } from './whoData';

export type Sex = 'f' | 'm';
export type Indicator = 'weight' | 'length' | 'head';

export const INDICATOR_LABEL: Record<Indicator, string> = { weight: 'Poids', length: 'Taille', head: 'Périmètre crânien' };
export const INDICATOR_UNIT: Record<Indicator, string> = { weight: 'kg', length: 'cm', head: 'cm' };

const TABLES: Record<Indicator, Record<Sex, readonly Lms[]>> = {
  weight: { f: POIDS_FILLE, m: POIDS_GARCON },
  length: { f: TAILLE_FILLE, m: TAILLE_GARCON },
  head: { f: PC_FILLE, m: PC_GARCON },
};

/** Âge en mois (mois moyen de 30,4375 jours, comme l'OMS). */
export function ageInMonths(birthDate: string, on: string): number {
  const days = (Date.parse(`${on}T12:00:00Z`) - Date.parse(`${birthDate}T12:00:00Z`)) / 86_400_000;
  return days / 30.4375;
}

export const MAX_MONTHS = 24;

/** Paramètres L, M, S à un âge donné (interpolation linéaire entre deux mois), ou null hors 0–24 mois. */
export function lmsAt(indicator: Indicator, sex: Sex, months: number): [number, number, number] | null {
  if (!(months >= 0 && months <= MAX_MONTHS)) return null;
  const t = TABLES[indicator][sex];
  const i = Math.min(Math.floor(months), MAX_MONTHS - 1);
  const f = months - i;
  const [, l0, m0, s0] = t[i];
  const [, l1, m1, s1] = t[i + 1];
  return [l0 + (l1 - l0) * f, m0 + (m1 - m0) * f, s0 + (s1 - s0) * f];
}

/** Valeur correspondant au score z (méthode LMS de Cole). */
export function valueAtZ([L, M, S]: [number, number, number], z: number): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

export function zScore(x: number, [L, M, S]: [number, number, number]): number {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

/** Fonction de répartition de la loi normale (approximation d'Abramowitz-Stegun, erreur < 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Percentile (0–100) d'une mesure, ou null hors des standards (âge > 24 mois, sexe inconnu). */
export function percentile(indicator: Indicator, sex: Sex, months: number, value: number): number | null {
  const lms = lmsAt(indicator, sex, months);
  if (!lms || !(value > 0)) return null;
  return normalCdf(zScore(value, lms)) * 100;
}

/** « 50e percentile », « < 1er », « > 99e » : formulation habituelle du carnet de santé. */
export function fmtPercentile(p: number): string {
  if (p < 1) return '< 1er percentile';
  if (p > 99) return '> 99e percentile';
  const n = Math.round(p);
  return `${n}${n === 1 ? 'er' : 'e'} percentile`;
}

/** Courbes de référence affichées : 3e, 15e, 50e, 85e et 97e percentiles. */
export const REFERENCE_Z = { p3: -1.880794, p15: -1.036433, p50: 0, p85: 1.036433, p97: 1.880794 } as const;

export function referenceCurve(indicator: Indicator, sex: Sex, z: number, fromMonth: number, toMonth: number, step = 0.25): [number, number][] {
  const pts: [number, number][] = [];
  for (let m = fromMonth; m <= toMonth + 1e-9; m += step) {
    const lms = lmsAt(indicator, sex, Math.min(m, MAX_MONTHS));
    if (lms) pts.push([m, valueAtZ(lms, z)]);
  }
  return pts;
}
