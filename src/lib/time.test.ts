import { describe, expect, it } from 'vitest';
import { babyAge, dayBounds, dayKey, fmtDuration, fmtTimer, fromLocalInput, shiftDay, timeAgo, toLocalInput } from './time';
import { eventsToCsv, summaryText } from './labels';
import type { Summary } from './summary';
import { emptyEvent } from './types';

describe('fmtDuration', () => {
  it('formate minutes et heures', () => {
    expect(fmtDuration(20_000)).toBe('<\u00a01\u00a0min');
    expect(fmtDuration(12 * 60_000)).toBe('12\u00a0min');
    expect(fmtDuration(65 * 60_000)).toBe('1\u00a0h\u00a005');
    expect(fmtDuration(120 * 60_000)).toBe('2\u00a0h');
  });
});

describe('fmtTimer', () => {
  it('formate le chrono en direct', () => {
    expect(fmtTimer(0)).toBe('00:00');
    expect(fmtTimer(252_000)).toBe('04:12');
    expect(fmtTimer(3_852_000)).toBe('1:04:12');
  });
});

describe('timeAgo', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime();
  it('parle en français naturel', () => {
    expect(timeAgo(new Date(now - 10_000).toISOString(), now)).toBe("à l'instant");
    expect(timeAgo(new Date(now - 12 * 60_000).toISOString(), now)).toBe('il y a 12\u00a0min');
    expect(timeAgo(new Date(now - 80 * 60_000).toISOString(), now)).toBe('il y a 1\u00a0h\u00a020');
    expect(timeAgo(new Date(now - 49 * 3_600_000).toISOString(), now)).toBe('il y a 2 j');
  });
});

describe('jours locaux', () => {
  it('dayKey / shiftDay / dayBounds', () => {
    expect(dayKey(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13');
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    const [a, b] = dayBounds('2026-10-13');
    expect(new Date(a).getHours()).toBe(0);
    expect(b - a).toBe(24 * 3_600_000);
  });

  it("gère le passage à l'heure d'hiver (journée de 25 h)", () => {
    const [a, b] = dayBounds('2026-10-25');
    expect((b - a) / 3_600_000).toBe(25);
  });

  it('aller-retour datetime-local', () => {
    const iso = new Date(2026, 9, 13, 14, 5).toISOString();
    expect(toLocalInput(iso)).toBe('2026-10-13T14:05');
    expect(fromLocalInput('2026-10-13T14:05')).toBe(iso);
    expect(fromLocalInput('')).toBeNull();
  });
});

describe('babyAge', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime();
  it("affiche l'âge de façon lisible", () => {
    expect(babyAge(null, now)).toBeNull();
    expect(babyAge('2026-10-20', now)).toBeNull();
    expect(babyAge('2026-10-12', now)).toBe('1 jour');
    expect(babyAge('2026-10-08', now)).toBe('5 jours');
    expect(babyAge('2026-09-22', now)).toBe('3 sem.');
    expect(babyAge('2026-09-21', now)).toBe('3 sem. 1 j');
    expect(babyAge('2026-06-13', now)).toBe('4 mois');
    expect(babyAge('2024-01-01', now)).toBe('2 ans');
  });
});

describe('eventsToCsv', () => {
  it('exporte un CSV Excel-friendly avec échappement', () => {
    const e = {
      ...emptyEvent('b', 'bottle', new Date(2026, 9, 13, 9, 30).toISOString()),
      id: '1',
      amountMl: 90,
      note: 'a bien "bu"; rot ok',
    };
    const csv = eventsToCsv([e]);
    const lines = csv.split('\r\n');
    expect(csv.startsWith('﻿Date;')).toBe(true);
    expect(lines[0]).toBe('\uFEFFDate;Début;Fin;Durée (min);Type;Détail;Quantité bue (ml);Note'); // BOM : accents corrects dans Excel
    // la quantité bue est une vraie colonne numérique (exploitable dans Excel)
    expect(lines[1]).toBe('2026-10-13;09h30;;;Biberon;;90;"a bien ""bu""; rot ok"');
  });
});

describe('summaryText', () => {
  const base: Summary = { breastCount: 0, breastMs: 0, bottleCount: 0, bottleMl: 0, diaperCount: 0, pee: 0, poop: 0, sleepMs: 0, sleepCount: 0 };

  it('exprime la quantité de biberon en ml BUS', () => {
    expect(summaryText('bottle', { ...base, bottleCount: 2, bottleMl: 180 })).toBe('2 biberons · 180\u00a0ml\u00a0bus');
    expect(summaryText('bottle', { ...base, bottleCount: 1, bottleMl: 90 })).toBe('1 biberon · 90\u00a0ml\u00a0bus');
    expect(summaryText('bottle', { ...base, bottleCount: 13, bottleMl: 1150 })).toBe('13 biberons · 1\u202f150\u00a0ml\u00a0bus');
  });

  it('n\'affiche pas de quantité quand elle est inconnue, et accorde le pluriel', () => {
    expect(summaryText('bottle', { ...base, bottleCount: 1 })).toBe('1 biberon');
    expect(summaryText('breast', { ...base, breastCount: 0 })).toBe('0 tétée');
    expect(summaryText('diaper', { ...base, diaperCount: 3 })).toBe('3 couches');
    expect(summaryText('sleep', base)).toBe('0 min de sommeil');
  });
});
