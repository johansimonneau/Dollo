export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** « 14h05 » */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

/** « 12 min », « 1 h 05 », « 2 h » (espaces insécables) */
export function fmtDuration(ms: number): string {
  // Espaces insécables : « 1 h 05 » ou « < 1 min » ne doivent jamais se couper en fin de ligne.
  const totalMin = Math.max(0, Math.round(ms / MINUTE));
  if (totalMin < 1) return '<\u00a01\u00a0min';
  if (totalMin < 60) return `${totalMin}\u00a0min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}\u00a0h` : `${h}\u00a0h\u00a0${pad(m)}`;
}

/** Chrono en direct : « 04:12 » ou « 1:04:12 » */
export function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** « à l'instant », « il y a 12 min », « il y a 1 h 20 », « il y a 2 j » */
export function timeAgo(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  if (diff < MINUTE) return "à l'instant";
  if (diff < DAY) return `il y a ${fmtDuration(diff)}`;
  return `il y a ${Math.floor(diff / DAY)} j`;
}

/** Clé de jour locale : « 2026-10-13 ». */
export function dayKey(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Bornes [minuit, minuit suivant[ en heure locale (robuste aux changements d'heure). */
export function dayBounds(key: string): [number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];
}

export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
}

export function fmtDayLabel(key: string, nowMs: number): string {
  const todayKey = dayKey(nowMs);
  if (key === todayKey) return "Aujourd'hui";
  if (key === shiftDay(todayKey, -1)) return 'Hier';
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
}

export function fmtWeekdayShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' }).format(new Date(y, m - 1, d)).toUpperCase();
}

/** Valeur pour <input type="datetime-local"> en heure locale. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Âge lisible : « 5 jours », « 3 sem. 2 j », « 4 mois ». Null si pas de date ou date future. */
export function babyAge(birthDate: string | null, nowMs: number): string | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  const days = Math.floor((nowMs - birth.getTime()) / DAY);
  if (days < 0) return null;
  if (days < 14) return days <= 1 ? `${days} jour` : `${days} jours`;
  if (days < 61) {
    const w = Math.floor(days / 7);
    const rest = days % 7;
    return rest === 0 ? `${w} sem.` : `${w} sem. ${rest} j`;
  }
  const now = new Date(nowMs);
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
  if (now.getDate() < d) months -= 1;
  if (months < 24) return `${months} mois`;
  return `${Math.floor(months / 12)} ans`;
}
