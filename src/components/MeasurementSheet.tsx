import { useState, type FormEvent } from 'react';
import { errorMessage } from '../data/store';
import { dayKey } from '../lib/time';
import type { Measurement, NewMeasurement } from '../lib/types';
import { Sheet } from './Sheet';

interface Props {
  babyId: string;
  birthDate: string | null;
  measurement?: Measurement;
  onSave: (m: NewMeasurement) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/** « 4,25 » ou « 4.25 » → 4.25 ; vide → null ; illisible → NaN. */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const show = (v: number | null, div: number) => (v == null ? '' : String(v / div).replace('.', ','));

/** Saisie d'une pesée / mesure (cabinet du pédiatre, PMI, pèse-bébé). Au moins une des trois valeurs. */
export function MeasurementSheet({ babyId, birthDate, measurement, onSave, onDelete, onClose }: Props) {
  const today = dayKey(Date.now());
  const [date, setDate] = useState(measurement?.measuredOn ?? today);
  const [weight, setWeight] = useState(show(measurement?.weightG ?? null, 1000));
  const [length, setLength] = useState(show(measurement?.lengthMm ?? null, 10));
  const [head, setHead] = useState(show(measurement?.headMm ?? null, 10));
  const [note, setNote] = useState(measurement?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const w = parseDecimal(weight);
    const l = parseDecimal(length);
    const h = parseDecimal(head);
    if (!date || date > today) return setError('La date ne peut pas être dans le futur.');
    if (birthDate && date < birthDate) return setError('La date est avant la naissance.');
    if (w === null && l === null && h === null) return setError('Indiquez au moins le poids, la taille ou le périmètre crânien.');
    if (Number.isNaN(w) || (w !== null && (w < 0.3 || w > 30))) return setError('Poids en kg, par exemple 4,25.');
    if (Number.isNaN(l) || (l !== null && (l < 20 || l > 130))) return setError('Taille en cm, par exemple 54,5.');
    if (Number.isNaN(h) || (h !== null && (h < 20 || h > 60))) return setError('Périmètre crânien en cm, par exemple 37.');
    setBusy(true);
    try {
      await onSave({
        babyId,
        measuredOn: date,
        weightG: w === null ? null : Math.round(w * 1000),
        lengthMm: l === null ? null : Math.round(l * 10),
        headMm: h === null ? null : Math.round(h * 10),
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={measurement ? 'Modifier la mesure' : 'Nouvelle mesure'} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span className="label">Date</span>
          <input className="input" type="date" value={date} min={birthDate ?? undefined} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="measure-grid">
          <label className="field">
            <span className="label">Poids (kg)</span>
            <input className="input" inputMode="decimal" placeholder="4,25" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Taille (cm)</span>
            <input className="input" inputMode="decimal" placeholder="54,5" value={length} onChange={(e) => setLength(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Périmètre crânien (cm)</span>
            <input className="input" inputMode="decimal" placeholder="37" value={head} onChange={(e) => setHead(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="label">Note (facultatif)</span>
          <input className="input" value={note} maxLength={500} placeholder="Pesée PMI, visite du 1er mois…" onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary block" disabled={busy}>
          Enregistrer
        </button>
        {onDelete && (
          <button type="button" className="link-btn danger" disabled={busy} onClick={() => void onDelete()}>
            Supprimer cette mesure
          </button>
        )}
      </form>
    </Sheet>
  );
}
