import type { BabyEvent, DiaperType, EventKind } from './types';
import type { Summary } from './summary';
import { fmtClock, fmtDuration } from './time';

export const KIND_LABEL: Record<EventKind, string> = {
  breast: 'Tétée',
  bottle: 'Biberon',
  diaper: 'Couche',
  sleep: 'Sommeil',
  temp: 'Température',
  med: 'Médicament',
};

/** « 38,2 °C » */
export const fmtTemp = (c: number) => `${c.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00a0°C`;

/** Fièvre chez le nourrisson : 38 °C et plus (repère de santé publique). */
export const FEVER_C = 38;

export const DIAPER_LABEL: Record<DiaperType, string> = {
  pee: 'Pipi',
  poop: 'Caca',
  both: 'Pipi + caca',
};

/** « 1 150 ml » : séparateur de milliers français, espaces insécables. */
export const fmtMl = (ml: number) => `${ml.toLocaleString('fr-FR')}\u00a0ml`;

/** « 0,72 L » (2 décimales, espace insécable) : le cumul de biberons du jour, lisible d'un coup d'œil. */
export const fmtLiters = (ml: number) =>
  `${(ml / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0L`;

/** Cumul de biberons : « 510 ml » sous le litre (plus parlant que « 0,51 L »), « 1,25 L » au-delà. */
export const fmtVolume = (ml: number) => (ml < 1000 ? fmtMl(ml) : fmtLiters(ml));

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Résumé d'un type d'événement : « 2 biberons · 180 ml ». La quantité d'un biberon est toujours la quantité bue. */
export function summaryText(kind: EventKind, s: Summary): string {
  switch (kind) {
    case 'breast':
      return plural(s.breastCount, 'tétée');
    case 'bottle':
      return plural(s.bottleCount, 'biberon') + (s.bottleMl > 0 ? ` · ${fmtVolume(s.bottleMl)}` : '');
    case 'diaper':
      return plural(s.diaperCount, 'couche');
    case 'sleep':
      return `${s.sleepMs > 0 ? fmtDuration(s.sleepMs) : '0 min'} de sommeil`;
    case 'temp':
      return s.tempCount > 0 && s.tempMax !== null ? `${plural(s.tempCount, 'prise')} · max ${fmtTemp(s.tempMax)}` : '0 prise';
    case 'med':
      return plural(s.medCount, 'médicament');
  }
}

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
    case 'temp':
      return e.tempC != null ? `Température · ${fmtTemp(e.tempC)}` : 'Température';
    case 'med':
      return [e.medName ?? 'Médicament', e.medDose].filter(Boolean).join(' · ');
  }
}

const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export CSV (séparateur « ; », BOM UTF-8) à montrer au pédiatre ou à ouvrir dans Excel. */
export function eventsToCsv(events: BabyEvent[]): string {
  const header = ['Date', 'Début', 'Fin', 'Durée (min)', 'Type', 'Détail', 'Quantité bue (ml)', 'Note'];
  const rows = [...events]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((e) => {
      const start = new Date(e.startedAt);
      const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const minutes = e.endedAt ? Math.round((new Date(e.endedAt).getTime() - start.getTime()) / 60000) : null;
      const detail =
        e.kind === 'temp' && e.tempC != null
          ? fmtTemp(e.tempC).replace('\u00a0', ' ')
          : e.kind === 'med'
            ? [e.medName, e.medDose].filter(Boolean).join(' ')
            : e.kind === 'breast'
          ? e.side
            ? SIDE_LABEL[e.side]
            : ''
          : e.kind === 'diaper'
            ? e.diaperType
              ? DIAPER_LABEL[e.diaperType]
              : ''
            : '';
      return [date, fmtClock(e.startedAt), e.endedAt ? fmtClock(e.endedAt) : '', minutes, KIND_LABEL[e.kind], detail, e.kind === 'bottle' ? e.amountMl : null, e.note]
        .map(csvCell)
        .join(';');
    });
  return '﻿' + [header.join(';'), ...rows].join('\r\n');
}
