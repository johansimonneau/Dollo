import { useState } from 'react';
import { DIAPER_LABEL } from '../lib/labels';
import type { DiaperType } from '../lib/types';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { NOW, TimeChips, type When } from './TimeChips';

const DIAPER_TYPES: DiaperType[] = ['pee', 'poop', 'both'];

interface DiaperProps {
  onSave: (type: DiaperType, when: When, note: string | null) => void;
  onClose: () => void;
}

/** Une couche en deux touches : « Quand ? » (par défaut maintenant), puis le type — qui enregistre aussitôt. */
export function DiaperSheet({ onSave, onClose }: DiaperProps) {
  const [when, setWhen] = useState<When>(NOW);
  const [note, setNote] = useState('');
  return (
    <Sheet title="Couche" onClose={onClose}>
      <TimeChips value={when} onChange={setWhen} />
      <div className="field">
        <span className="label">Quoi ? (touchez pour enregistrer)</span>
        <div className="big-choices">
          {DIAPER_TYPES.map((t) => (
            <button key={t} type="button" className="big-choice kind-diaper" onClick={() => onSave(t, when, note.trim() || null)}>
              <Icon.Diaper size={26} />
              {t === 'both' ? 'Les deux' : DIAPER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="label">Note (facultatif)</span>
        <input
          className="input"
          value={note}
          maxLength={500}
          placeholder="Couleur, rougeurs, selles liquides…"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

const PRESETS = [30, 60, 90, 120, 150, 180];

interface BottleProps {
  defaultMl: number;
  onSave: (ml: number, when: When, note: string | null) => void;
  onClose: () => void;
}

export function BottleSheet({ defaultMl, onSave, onClose }: BottleProps) {
  const [when, setWhen] = useState<When>(NOW);
  const [ml, setMl] = useState(defaultMl);
  const [note, setNote] = useState('');
  const clamp = (n: number) => Math.min(500, Math.max(0, n));
  return (
    <Sheet title="Biberon" onClose={onClose}>
      <TimeChips value={when} onChange={setWhen} />
      <div className="field">
        <span className="label">Quantité bue</span>
        <span className="hint">Ce que bébé a réellement bu, pas ce qui était préparé.</span>
        <div className="stepper">
          <button type="button" className="icon-btn big" aria-label="Moins 10 ml" onClick={() => setMl((v) => clamp(v - 10))}>
            −
          </button>
          <output className="stepper-value" aria-live="polite">
            {ml} <small>ml</small>
          </output>
          <button type="button" className="icon-btn big" aria-label="Plus 10 ml" onClick={() => setMl((v) => clamp(v + 10))}>
            +
          </button>
        </div>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={ml === p} onClick={() => setMl(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="label">Note (facultatif)</span>
        <input
          className="input"
          value={note}
          maxLength={500}
          placeholder="Lait maternel, 1er âge, régurgité…"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button type="button" className="btn primary block" onClick={() => onSave(ml, when, note.trim() || null)}>
        Enregistrer
      </button>
    </Sheet>
  );
}
