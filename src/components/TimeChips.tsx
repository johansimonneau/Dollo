import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '../lib/time';

/** « Quand ? » : un décalage relatif (par défaut « maintenant »), ou une date/heure précise. */
export type When = { kind: 'offset'; minutes: number } | { kind: 'custom'; local: string };

export const NOW: When = { kind: 'offset', minutes: 0 };

/** Résout au moment de l'enregistrement (et non de l'ouverture de la feuille), pour que « maintenant » reste juste. */
export function resolveWhen(when: When, nowMs = Date.now()): string | null {
  if (when.kind === 'offset') return new Date(nowMs - when.minutes * 60_000).toISOString();
  return fromLocalInput(when.local);
}

const OPTIONS = [
  { minutes: 0, label: 'Maintenant' },
  { minutes: 10, label: '−10 min' },
  { minutes: 30, label: '−30 min' },
  { minutes: 60, label: '−1 h' },
];

interface Props {
  value: When;
  onChange: (when: When) => void;
}

export function TimeChips({ value, onChange }: Props) {
  const [showCustom, setShowCustom] = useState(value.kind === 'custom');
  return (
    <div className="field">
      <span className="label" id="when-label">
        Quand ?
      </span>
      <div className="chips" role="group" aria-labelledby="when-label">
        {OPTIONS.map((o) => (
          <button
            key={o.minutes}
            type="button"
            className="chip"
            aria-pressed={value.kind === 'offset' && value.minutes === o.minutes}
            onClick={() => {
              setShowCustom(false);
              onChange({ kind: 'offset', minutes: o.minutes });
            }}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={value.kind === 'custom'}
          onClick={() => {
            setShowCustom(true);
            if (value.kind !== 'custom') onChange({ kind: 'custom', local: toLocalInput(new Date().toISOString()) });
          }}
        >
          Autre…
        </button>
      </div>
      {showCustom && value.kind === 'custom' && (
        <input
          type="datetime-local"
          className="input"
          aria-label="Date et heure"
          value={value.local}
          max={toLocalInput(new Date(Date.now() + 60_000).toISOString())}
          onChange={(e) => onChange({ kind: 'custom', local: e.target.value })}
        />
      )}
    </div>
  );
}
