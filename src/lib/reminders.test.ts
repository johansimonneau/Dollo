import { describe, expect, it } from 'vitest';
import { dueReminders, isNight, localHour, nextFeedAt, reminderText, remindersToNotify, type ReminderEvent } from '../../supabase/functions/_shared/reminders';

const H = 3_600_000;
const now = Date.UTC(2026, 9, 14, 12, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const ev = (id: string, kind: ReminderEvent['kind'], agoH: number, extra: Partial<ReminderEvent> = {}): ReminderEvent => ({
  id, kind, startedAt: iso(now - agoH * H), endedAt: kind === 'breast' ? iso(now - agoH * H + 0.25 * H) : null, diaperType: null, ...extra,
});
const prefs = { feedEveryMin: 180, diaperDryHours: 6, quietNight: false };

describe('rappels', () => {
  it('rien de dû sans réglage ni historique', () => {
    expect(dueReminders([ev('a', 'bottle', 5)], { feedEveryMin: null, diaperDryHours: null, quietNight: false }, now)).toEqual([]);
    expect(dueReminders([], prefs, now)).toEqual([]);
  });

  it('repas : dû 3 h après le DÉBUT du dernier repas (tétée ou biberon, le plus récent)', () => {
    const events = [ev('old', 'bottle', 5), ev('last', 'breast', 3.5)];
    expect(dueReminders(events, prefs, now)).toMatchObject([{ kind: 'feed', refId: 'last' }]);
    expect(dueReminders([ev('b', 'bottle', 2.5)], prefs, now)).toEqual([]);
    expect(nextFeedAt([ev('b', 'bottle', 2.5)], prefs)).toBe(now + 0.5 * H);
  });

  it("pas de rappel repas pendant une tétée en cours", () => {
    expect(dueReminders([ev('t', 'breast', 4, { endedAt: null })], prefs, now)).toEqual([]);
  });

  it('couche : seules les couches mouillées (pipi, pipi + caca) remettent le compteur à zéro', () => {
    const events = [ev('pee', 'diaper', 7, { diaperType: 'pee' }), ev('poop', 'diaper', 1, { diaperType: 'poop' })];
    expect(dueReminders(events, { ...prefs, feedEveryMin: null }, now)).toMatchObject([{ kind: 'diaper', refId: 'pee' }]);
    const both = [...events, ev('both', 'diaper', 2, { diaperType: 'both' })];
    expect(dueReminders(both, { ...prefs, feedEveryMin: null }, now)).toEqual([]);
  });

  it("nuit de 22 h à 7 h, à l'heure locale du fuseau", () => {
    expect(localHour(Date.UTC(2026, 9, 14, 21, 30), 'Europe/Paris')).toBe(23); // heure d'été : UTC+2
    expect(isNight(23)).toBe(true);
    expect(isNight(6)).toBe(true);
    expect(isNight(7)).toBe(false);
    expect(isNight(21)).toBe(false);
  });

  it('notifications : rien la nuit si demandé, rien de périmé (suivi en pause)', () => {
    const due = dueReminders([ev('b', 'bottle', 4)], prefs, now);
    expect(remindersToNotify(due, prefs, now, 14)).toHaveLength(1);
    expect(remindersToNotify(due, { ...prefs, quietNight: true }, now, 23)).toEqual([]);
    expect(remindersToNotify(due, { ...prefs, quietNight: false }, now, 23)).toHaveLength(1);
    const stale = dueReminders([ev('b', 'bottle', 20)], prefs, now);
    expect(stale).toHaveLength(1); // le bandeau de l'app l'affiche…
    expect(remindersToNotify(stale, prefs, now, 14)).toEqual([]); // …mais pas de notification
  });

  it('texte lisible sur l’écran verrouillé', () => {
    const [r] = dueReminders([ev('b', 'bottle', 3.25)], prefs, now);
    expect(reminderText(r, 'Léa', now)).toEqual({ title: "Léa : bientôt l'heure de manger", body: 'Dernier repas il y a 3 h 15.' });
  });
});
