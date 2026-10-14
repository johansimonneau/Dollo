import { useState, type FormEvent, type JSX } from 'react';
import { DIAPER_LABEL, KIND_LABEL, SIDE_LABEL } from '../lib/labels';
import { MINUTE, fromLocalInput, toLocalInput } from '../lib/time';
import type { BabyEvent, BreastSide, DiaperType, EventKind, NewEvent } from '../lib/types';
import { errorMessage } from '../data/store';
import { Icon } from './icons';
import { Sheet } from './Sheet';

export type EventData = Omit<NewEvent, 'babyId'>;

interface Props {
  /** Présent = modification ; absent = ajout manuel (par ex. un biberon oublié tout à l'heure). */
  event?: BabyEvent;
  onSave: (data: EventData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const KINDS: { kind: EventKind; icon: (p: { size?: number }) => JSX.Element }[] = [
  { kind: 'breast', icon: Icon.Breast },
  { kind: 'bottle', icon: Icon.Bottle },
  { kind: 'diaper', icon: Icon.Diaper },
  { kind: 'sleep', icon: Icon.Moon },
  { kind: 'temp', icon: Icon.Thermo },
  { kind: 'med', icon: Icon.Pill },
];

/** « 38,2 » ou « 38.2 » → 38.2 ; vide ou illisible → null. */
export const parseTemp = (raw: string): number | null => {
  const t = raw.trim().replace(',', '.');
  return /^\d{2}(\.\d)?$/.test(t) ? Number(t) : null;
};

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / MINUTE));

export function EventSheet({ event, onSave, onDelete, onClose }: Props) {
  const [kind, setKind] = useState<EventKind | null>(event?.kind ?? null);
  const [start, setStart] = useState(toLocalInput(event?.startedAt ?? new Date().toISOString()));
  const [end, setEnd] = useState(event?.endedAt ? toLocalInput(event.endedAt) : '');
  const [side, setSide] = useState<BreastSide>(event?.side ?? 'left');
  const [duration, setDuration] = useState(event?.endedAt ? String(minutesBetween(event.startedAt, event.endedAt)) : '');
  const [ml, setMl] = useState(event?.amountMl != null ? String(event.amountMl) : '');
  const [diaperType, setDiaperType] = useState<DiaperType>(event?.diaperType ?? 'pee');
  const [note, setNote] = useState(event?.note ?? '');
  const [temp, setTemp] = useState(event?.tempC != null ? String(event.tempC).replace('.', ',') : '');
  const [medName, setMedName] = useState(event?.medName ?? '');
  const [medDose, setMedDose] = useState(event?.medDose ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!kind) {
    return (
      <Sheet title="Ajouter un événement" onClose={onClose}>
        <p className="hint">Oublié de noter quelque chose ? Choisissez le type, puis l'heure exacte.</p>
        <div className="big-choices two">
          {KINDS.map(({ kind: k, icon: I }) => (
            <button key={k} type="button" className={`big-choice kind-${k}`} onClick={() => setKind(k)}>
              <I size={26} />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const startIso = fromLocalInput(start);
    if (!startIso) return setError("L'heure de début est invalide.");
    if (new Date(startIso).getTime() > Date.now() + 5 * MINUTE) return setError("L'heure est dans le futur.");

    let endedAt: string | null = null;
    if (kind === 'breast' && duration.trim() !== '') {
      const m = Number(duration);
      if (!Number.isFinite(m) || m < 0 || m > 180) return setError('Durée invalide (de 0 à 180 minutes).');
      endedAt = new Date(new Date(startIso).getTime() + Math.round(m) * MINUTE).toISOString();
    }
    if (kind === 'sleep' && end) {
      const endIso = fromLocalInput(end);
      if (!endIso) return setError("L'heure de réveil est invalide.");
      if (new Date(endIso) < new Date(startIso)) return setError("Le réveil doit être après l'endormissement.");
      endedAt = endIso;
    }

    let amountMl: number | null = null;
    if (kind === 'bottle' && ml.trim() !== '') {
      const v = Number(ml);
      if (!Number.isFinite(v) || v < 0 || v > 1000) return setError('Quantité invalide (de 0 à 1000 ml).');
      amountMl = Math.round(v);
    }

    let tempC: number | null = null;
    if (kind === 'temp') {
      tempC = parseTemp(temp);
      if (tempC === null || tempC < 34 || tempC > 43) return setError('Température en °C, par exemple 38,2.');
    }
    if (kind === 'med' && !medName.trim()) return setError('Indiquez le nom du médicament.');

    setBusy(true);
    try {
      await onSave({
        kind,
        startedAt: startIso,
        endedAt,
        side: kind === 'breast' ? side : null,
        amountMl,
        diaperType: kind === 'diaper' ? diaperType : null,
        note: note.trim() || null,
        // Champs santé : seulement pour les événements concernés.
        ...(kind === 'temp' ? { tempC } : {}),
        ...(kind === 'med' ? { medName: medName.trim(), medDose: medDose.trim() || null } : {}),
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={`${event ? 'Modifier' : 'Ajouter'} · ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {kind === 'breast' && (
          <div className="field">
            <span className="label" id="side-label">
              Sein
            </span>
            <div className="segmented" role="group" aria-labelledby="side-label">
              {(['left', 'right'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
                  {SIDE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'diaper' && (
          <div className="field">
            <span className="label" id="dtype-label">
              Type
            </span>
            <div className="segmented" role="group" aria-labelledby="dtype-label">
              {(['pee', 'poop', 'both'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={diaperType === t} onClick={() => setDiaperType(t)}>
                  {DIAPER_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span className="label">{kind === 'sleep' ? 'Endormissement' : 'Heure'}</span>
          <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>

        {kind === 'breast' && (
          <label className="field">
            <span className="label">Durée (minutes)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              value={duration}
              placeholder="Vide = tétée en cours"
              onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
        )}

        {kind === 'sleep' && (
          <label className="field">
            <span className="label">Réveil</span>
            <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            <span className="hint">Vide = bébé dort encore.</span>
          </label>
        )}

        {kind === 'bottle' && (
          <label className="field">
            <span className="label">Quantité bue (ml)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              value={ml}
              placeholder="90"
              onChange={(e) => setMl(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
        )}

        {kind === 'temp' && (
          <label className="field">
            <span className="label">Température (°C)</span>
            <input className="input" inputMode="decimal" value={temp} placeholder="37,5" onChange={(e) => setTemp(e.target.value)} />
          </label>
        )}

        {kind === 'med' && (
          <>
            <label className="field">
              <span className="label">Médicament</span>
              <input className="input" value={medName} maxLength={60} placeholder="Vitamine D, paracétamol…" onChange={(e) => setMedName(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Dose (facultatif)</span>
              <input className="input" value={medDose} maxLength={40} placeholder="2,4 ml, 1 goutte…" onChange={(e) => setMedDose(e.target.value)} />
            </label>
          </>
        )}

        <label className="field">
          <span className="label">Note (facultatif)</span>
          <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            Enregistrer
          </button>
          {event && onDelete && !confirmDelete && (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Supprimer
            </button>
          )}
          {event && onDelete && confirmDelete && (
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>
              Confirmer la suppression
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
