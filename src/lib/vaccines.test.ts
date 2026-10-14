import { describe, expect, it } from 'vitest';
import { byAppointment, doseStatus, dueDate, VACCINE_CALENDAR } from './vaccines';

const dose = (code: string) => VACCINE_CALENDAR.find((d) => d.code === code)!;

describe('calendrier vaccinal', () => {
  it('codes uniques et compatibles avec la base (^[a-z0-9-]{2,40}$)', () => {
    const codes = VACCINE_CALENDAR.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^[a-z0-9-]{2,40}$/));
  });

  it('rendez-vous du nourrisson : 2, 3, 4, 5, 6, 11, 12 et 16–18 mois', () => {
    expect(byAppointment().map((g) => g.label)).toEqual(['2 mois', '3 mois', '4 mois', '5 mois', '6 mois', '11 mois', '12 mois', '16–18 mois']);
    expect(byAppointment().find((g) => g.months === 12)!.doses.map((d) => d.code)).toEqual(['ror-1', 'menacwy-2', 'menb-3']);
  });

  it('date prévue : même jour du mois, ramenée au dernier jour si besoin', () => {
    expect(dueDate('2026-08-01', 2)).toBe('2026-10-01');
    expect(dueDate('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('statut : fait, à faire (dans 14 jours ou passé depuis < 1 mois), en retard, plus tard', () => {
    const birth = '2026-08-01';
    expect(doseStatus(dose('hexa-1'), birth, '2026-09-01', '2026-10-01')).toBe('done');
    expect(doseStatus(dose('hexa-1'), birth, '2026-09-10', undefined)).toBe('upcoming');
    expect(doseStatus(dose('hexa-1'), birth, '2026-09-20', undefined)).toBe('due');
    expect(doseStatus(dose('hexa-1'), birth, '2026-10-20', undefined)).toBe('due');
    expect(doseStatus(dose('hexa-1'), birth, '2026-11-02', undefined)).toBe('late');
    // ROR 2 : fenêtre 16–18 mois
    expect(doseStatus(dose('ror-2'), birth, '2028-02-15', undefined)).toBe('due');
  });
});
