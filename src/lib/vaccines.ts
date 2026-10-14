/**
 * Calendrier vaccinal du nourrisson en France (0–2 ans), d'après le calendrier des vaccinations 2025–2026
 * (ministère de la Santé, Santé publique France / Vaccination Info Service). Les méningocoques B et ACWY sont
 * obligatoires pour les enfants nés depuis le 1er janvier 2025 ; le rotavirus est recommandé (2 ou 3 doses selon le
 * vaccin). Repère d'organisation uniquement : le médecin décide du schéma réel (rattrapage, prématurité…).
 */
export interface VaccineDose {
  /** Identifiant stable, enregistré en base (table vaccinations). */
  code: string;
  label: string;
  /** Âge prévu, en mois. */
  months: number;
  /** Fenêtre « vers » affichée (ex. ROR 2 : 16–18 mois). */
  untilMonths?: number;
  mandatory: boolean;
  /** Précision affichée sous le nom. */
  detail?: string;
}

const HEXA = 'Diphtérie, tétanos, coqueluche, polio, Hib, hépatite B (hexavalent)';

export const VACCINE_CALENDAR: readonly VaccineDose[] = [
  { code: 'hexa-1', label: HEXA, months: 2, mandatory: true, detail: '1re dose' },
  { code: 'pcv-1', label: 'Pneumocoque', months: 2, mandatory: true, detail: '1re dose' },
  { code: 'rota-1', label: 'Rotavirus (buvable)', months: 2, mandatory: false, detail: '1re dose · recommandé' },
  { code: 'menb-1', label: 'Méningocoque B', months: 3, mandatory: true, detail: '1re dose' },
  { code: 'rota-2', label: 'Rotavirus (buvable)', months: 3, mandatory: false, detail: '2e dose · recommandé' },
  { code: 'hexa-2', label: HEXA, months: 4, mandatory: true, detail: '2e dose' },
  { code: 'pcv-2', label: 'Pneumocoque', months: 4, mandatory: true, detail: '2e dose' },
  { code: 'rota-3', label: 'Rotavirus (buvable)', months: 4, mandatory: false, detail: '3e dose, selon le vaccin utilisé' },
  { code: 'menb-2', label: 'Méningocoque B', months: 5, mandatory: true, detail: '2e dose' },
  { code: 'menacwy-1', label: 'Méningocoques ACWY', months: 6, mandatory: true, detail: '1re dose' },
  { code: 'hexa-3', label: HEXA, months: 11, mandatory: true, detail: 'rappel' },
  { code: 'pcv-3', label: 'Pneumocoque', months: 11, mandatory: true, detail: 'rappel' },
  { code: 'ror-1', label: 'Rougeole, oreillons, rubéole (ROR)', months: 12, mandatory: true, detail: '1re dose' },
  { code: 'menacwy-2', label: 'Méningocoques ACWY', months: 12, mandatory: true, detail: 'rappel' },
  { code: 'menb-3', label: 'Méningocoque B', months: 12, mandatory: true, detail: 'rappel' },
  { code: 'ror-2', label: 'Rougeole, oreillons, rubéole (ROR)', months: 16, untilMonths: 18, mandatory: true, detail: '2e dose' },
];

export const CALENDAR_SOURCE = 'Calendrier des vaccinations 2025–2026 (France)';

/** Date prévue (YYYY-MM-DD) : date de naissance + N mois (même jour du mois, ramené au dernier jour si besoin). */
export function dueDate(birthDate: string, months: number): string {
  const [y, m, d] = birthDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type DoseStatus = 'done' | 'upcoming' | 'due' | 'late';

/**
 * - due : prévue dans les 14 jours, ou passée depuis moins d'un mois (« à faire ») ;
 * - late : passée depuis plus d'un mois sans être notée (« en retard ? » : souvent juste pas encore saisie) ;
 * - upcoming : plus tard.
 */
export function doseStatus(dose: VaccineDose, birthDate: string, today: string, givenOn: string | undefined): DoseStatus {
  if (givenOn) return 'done';
  const due = dueDate(birthDate, dose.months);
  const end = dueDate(birthDate, (dose.untilMonths ?? dose.months) + 1);
  if (today > end) return 'late';
  const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  return due <= soon ? 'due' : 'upcoming';
}

/** Regroupe le calendrier par rendez-vous (« 2 mois », « 3 mois »…). */
export function byAppointment(): { months: number; label: string; doses: VaccineDose[] }[] {
  const groups = new Map<number, VaccineDose[]>();
  for (const d of VACCINE_CALENDAR) groups.set(d.months, [...(groups.get(d.months) ?? []), d]);
  return [...groups.entries()].map(([months, doses]) => ({
    months,
    label: doses[0].untilMonths ? `${months}–${doses[0].untilMonths} mois` : `${months} mois`,
    doses,
  }));
}
