import type { BabyEvent, DiaperType, EventKind } from './types';
import { fmtClock } from './time';

export const KIND_LABEL: Record<EventKind, string> = {
  breast: 'Tétée',
  bottle: 'Biberon',
  diaper: 'Couche',
  sleep: 'Sommeil',
};

export const DIAPER_LABEL: Record<DiaperType, string> = {
  pee: 'Pipi',
  poop: 'Caca',
  both: 'Pipi + caca',
};

export const SIDE_LABEL = { left: 'Sein gauche', right: 'Sein droit' } as const;

/** Titre court d'un événement : « Sein gauche », « Biberon · 90 ml », « Caca »… */
export function eventTitle(e: BabyEvent): string {
  switch (e.kind) {
    case 'breast':
      return e.side ? SIDE_LABEL[e.side] : 'Tétée';
    case 'bottle':
      return e.amountMl ? `Biberon · ${e.amountMl} ml` : 'Biberon';
    case 'diaper':
      return e.diaperType ? DIAPER_LABEL[e.diaperType] : 'Couche';
    case 'sleep':
      return 'Sommeil';
  }
}

const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export CSV (séparateur « ; », BOM UTF-8) à montrer au pédiatre ou à ouvrir dans Excel. */
export function eventsToCsv(events: BabyEvent[]): string {
  const header = ['Date', 'Début', 'Fin', 'Durée (min)', 'Type', 'Détail', 'Note'];
  const rows = [...events]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((e) => {
      const start = new Date(e.startedAt);
      const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const minutes = e.endedAt ? Math.round((new Date(e.endedAt).getTime() - start.getTime()) / 60000) : null;
      const detail =
        e.kind === 'breast'
          ? e.side
            ? SIDE_LABEL[e.side]
            : ''
          : e.kind === 'bottle'
            ? e.amountMl
              ? `${e.amountMl} ml`
              : ''
            : e.kind === 'diaper'
              ? e.diaperType
                ? DIAPER_LABEL[e.diaperType]
                : ''
              : '';
      return [date, fmtClock(e.startedAt), e.endedAt ? fmtClock(e.endedAt) : '', minutes, KIND_LABEL[e.kind], detail, e.note]
        .map(csvCell)
        .join(';');
    });
  return '﻿' + [header.join(';'), ...rows].join('\r\n');
}
