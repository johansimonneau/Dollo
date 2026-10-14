import { useState } from 'react';
import { DIAPER_LABEL } from '../lib/labels';
import { fmtDuration } from '../lib/time';
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

const TEMP_PRESETS = [36.5, 37, 37.5, 38, 38.5, 39, 39.5];
const fmtT = (t: number) => t.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface TempProps {
  onSave: (tempC: number, when: When, note: string | null) => void;
  onClose: () => void;
}

/** Température : un préréglage ou ± 0,1 °C, puis « Enregistrer ». */
export function TempSheet({ onSave, onClose }: TempProps) {
  const [when, setWhen] = useState<When>(NOW);
  const [t, setT] = useState(37);
  const [note, setNote] = useState('');
  const clamp = (n: number) => Math.round(Math.min(43, Math.max(34, n)) * 10) / 10;
  return (
    <Sheet title="Température" onClose={onClose}>
      <TimeChips value={when} onChange={setWhen} />
      <div className="field">
        <span className="label">Température</span>
        <div className="stepper">
          <button type="button" className="icon-btn big" aria-label="Moins 0,1 degré" onClick={() => setT((v) => clamp(v - 0.1))}>
            −
          </button>
          <output className={`stepper-value${t >= 38 ? ' fever' : ''}`} aria-live="polite">
            {fmtT(t)} <small>°C</small>
          </output>
          <button type="button" className="icon-btn big" aria-label="Plus 0,1 degré" onClick={() => setT((v) => clamp(v + 0.1))}>
            +
          </button>
        </div>
        <div className="chips">
          {TEMP_PRESETS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={t === p} onClick={() => setT(p)}>
              {fmtT(p)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="label">Note (facultatif)</span>
        <input className="input" value={note} maxLength={500} placeholder="Rectale, après le bain…" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn primary block" onClick={() => onSave(t, when, note.trim() || null)}>
        Enregistrer
      </button>
    </Sheet>
  );
}

export interface RecentMed {
  name: string;
  dose: string | null;
  at: string;
}

interface MedProps {
  /** Médicaments déjà notés (du plus récent au plus ancien) : raccourcis et « dernière prise ». */
  recent: RecentMed[];
  defaultName?: string;
  now: number;
  onSave: (name: string, dose: string | null, when: When, note: string | null) => void;
  onClose: () => void;
}

const sameMed = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Médicament : nom (raccourcis des derniers utilisés), dose libre. Affiche la dernière prise pour éviter un doublon. */
export function MedSheet({ recent, defaultName = '', now, onSave, onClose }: MedProps) {
  const [when, setWhen] = useState<When>(NOW);
  const [name, setName] = useState(defaultName);
  const [dose, setDose] = useState(() => recent.find((r) => sameMed(r.name, defaultName))?.dose ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shortcuts: string[] = [];
  for (const r of recent) if (!shortcuts.some((s) => sameMed(s, r.name))) shortcuts.push(r.name);
  for (const d of ['Vitamine D', 'Paracétamol']) if (!shortcuts.some((s) => sameMed(s, d))) shortcuts.push(d);
  const last = name.trim() ? recent.find((r) => sameMed(r.name, name)) : undefined;
  const lastAgoMs = last ? now - new Date(last.at).getTime() : null;

  const pick = (n: string) => {
    setName(n);
    setDose(recent.find((r) => sameMed(r.name, n))?.dose ?? '');
    setError(null);
  };

  return (
    <Sheet title="Médicament" onClose={onClose}>
      <TimeChips value={when} onChange={setWhen} />
      <div className="field">
        <span className="label">Médicament</span>
        <div className="chips">
          {shortcuts.slice(0, 6).map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={sameMed(n, name)} onClick={() => pick(n)}>
              {n}
            </button>
          ))}
        </div>
        <input className="input" aria-label="Nom du médicament" value={name} maxLength={60} placeholder="Autre médicament" onChange={(e) => setName(e.target.value)} />
      </div>
      {last && lastAgoMs !== null && lastAgoMs < 24 * 3_600_000 && (
        <p className="med-last" role="status">
          Dernière prise de {last.name} il y a {fmtDuration(Math.max(0, lastAgoMs))}
          {last.dose ? ` (${last.dose})` : ''}. Vérifiez avant de redonner.
        </p>
      )}
      <label className="field">
        <span className="label">Dose (facultatif)</span>
        <input className="input" value={dose} maxLength={40} placeholder="2,4 ml, 1 goutte…" onChange={(e) => setDose(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Note (facultatif)</span>
        <input className="input" value={note} maxLength={500} placeholder="Prescrit par…, pour…" onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn primary block"
        onClick={() => (name.trim() ? onSave(name.trim(), dose.trim() || null, when, note.trim() || null) : setError('Indiquez le nom du médicament.'))}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}
