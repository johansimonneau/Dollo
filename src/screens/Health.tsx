import { useCallback, useEffect, useState } from 'react';
import { KIND_ICON } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/toast';
import { errorMessage, type Store } from '../data/store';
import { FEVER_C, fmtTemp } from '../lib/labels';
import { dayKey, fmtClock, fmtDate } from '../lib/time';
import type { Baby, BabyEvent, Vaccination } from '../lib/types';
import { byAppointment, CALENDAR_SOURCE, doseStatus, dueDate, type DoseStatus, type VaccineDose } from '../lib/vaccines';

interface Props {
  store: Store;
  baby: Baby;
  events: BabyEvent[];
  now: number;
  /** Prévenir l'écran parent (bandeau « vaccins à faire ») après une modification. */
  onVaccinesChanged?: () => void;
}

const STATUS_LABEL: Record<DoseStatus, string> = { done: 'Fait', due: 'À faire', late: 'Pas encore noté', upcoming: 'Plus tard' };

/** Santé : calendrier vaccinal (France) avec suivi des doses, températures et médicaments récents. */
export function Health({ store, baby, events, now, onVaccinesChanged }: Props) {
  const toast = useToast();
  const [given, setGiven] = useState<Vaccination[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<VaccineDose | null>(null);

  const load = useCallback(async () => {
    try {
      setGiven(await store.listVaccinations(baby.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [store, baby.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const today = dayKey(now);
  const byCode = new Map((given ?? []).map((v) => [v.code, v]));
  const temps = events.filter((e) => e.kind === 'temp' && e.tempC != null).slice(0, 8);
  const meds = events.filter((e) => e.kind === 'med').slice(0, 8);
  const groups = byAppointment();
  const total = groups.reduce((n, g) => n + g.doses.length, 0);

  return (
    <div className="health">
      <section className="card pad" aria-label="Vaccins">
        <h2 className="section-title flush">Vaccins</h2>
        {!baby.birthDate ? (
          <p className="hint">Renseignez la date de naissance (Réglages) pour voir les dates prévues.</p>
        ) : error ? (
          <p className="form-error">Vaccins indisponibles : {error}</p>
        ) : (
          <>
            <p className="hint">
              {byCode.size} / {total} doses notées · {CALENDAR_SOURCE}. Touchez une dose pour la noter.
            </p>
            {groups.map((g) => (
              <div key={g.months} className="vax-group">
                <h3>
                  {g.label} <small>· vers le {fmtDate(dueDate(baby.birthDate!, g.months))}</small>
                </h3>
                <ul>
                  {g.doses.map((d) => {
                    const v = byCode.get(d.code);
                    const st = doseStatus(d, baby.birthDate!, today, v?.givenOn);
                    return (
                      <li key={d.code}>
                        <button type="button" className={`vax-row ${st}`} onClick={() => setEditing(d)}>
                          <span className="vax-name">
                            {d.label}
                            <small>
                              {d.detail}
                              {d.mandatory ? ' · obligatoire' : ''}
                            </small>
                          </span>
                          <span className={`vax-status ${st}`}>{st === 'done' && v ? `Fait le ${fmtDate(v.givenOn)}` : STATUS_LABEL[st]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="report-note">
              Repère d'organisation, à vérifier avec le carnet de santé : votre médecin adapte le schéma (rattrapage, prématurité, vaccin
              utilisé).
            </p>
          </>
        )}
      </section>

      <section className="card pad" aria-label="Températures récentes">
        <h2 className="section-title flush">Températures</h2>
        {temps.length === 0 ? (
          <p className="hint">Aucune température notée (bouton « Température » sur Aujourd'hui).</p>
        ) : (
          <ul className="health-list">
            {temps.map((e) => (
              <li key={e.id} className={e.tempC! >= FEVER_C ? 'fever' : ''}>
                <KIND_ICON.temp size={18} /> <strong>{fmtTemp(e.tempC!)}</strong> · {fmtDate(dayKey(e.startedAt))} à {fmtClock(e.startedAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card pad" aria-label="Médicaments récents">
        <h2 className="section-title flush">Médicaments</h2>
        {meds.length === 0 ? (
          <p className="hint">Aucun médicament noté (bouton « Médicament » sur Aujourd'hui).</p>
        ) : (
          <ul className="health-list">
            {meds.map((e) => (
              <li key={e.id}>
                <KIND_ICON.med size={18} /> <strong>{e.medName}</strong>
                {e.medDose ? ` · ${e.medDose}` : ''} · {fmtDate(dayKey(e.startedAt))} à {fmtClock(e.startedAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && baby.birthDate && (
        <VaccineSheet
          dose={editing}
          given={byCode.get(editing.code)}
          birthDate={baby.birthDate}
          onClose={() => setEditing(null)}
          onSave={async (date, note) => {
            await store.saveVaccination(baby.id, editing.code, date, note);
            setEditing(null);
            toast.show('Vaccin noté.');
            await load();
            onVaccinesChanged?.();
          }}
          onDelete={async (id) => {
            await store.deleteVaccination(id);
            setEditing(null);
            toast.show('Vaccin retiré.');
            await load();
            onVaccinesChanged?.();
          }}
        />
      )}
    </div>
  );
}

function VaccineSheet({
  dose,
  given,
  birthDate,
  onSave,
  onDelete,
  onClose,
}: {
  dose: VaccineDose;
  given?: Vaccination;
  birthDate: string;
  onSave: (date: string, note: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const today = dayKey(Date.now());
  const [date, setDate] = useState(given?.givenOn ?? today);
  const [note, setNote] = useState(given?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Sheet title={dose.label} onClose={onClose}>
      <p className="hint">
        {dose.detail} · prévu vers le {fmtDate(dueDate(birthDate, dose.months))}
        {dose.mandatory ? ' · obligatoire' : ''}
      </p>
      <label className="field">
        <span className="label">Fait le</span>
        <input className="input" type="date" value={date} min={birthDate} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Note (facultatif)</span>
        <input className="input" value={note} maxLength={300} placeholder="Nom du vaccin, numéro de lot…" onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn primary block"
        disabled={busy || !date}
        onClick={() => void run(() => (date > today || date < birthDate ? Promise.reject(new Error('Date invalide.')) : onSave(date, note.trim() || null)))}
      >
        {given ? 'Enregistrer' : 'Marquer comme fait'}
      </button>
      {given && (
        <button type="button" className="link-btn danger" disabled={busy} onClick={() => void run(() => onDelete(given.id))}>
          Pas encore fait (retirer)
        </button>
      )}
    </Sheet>
  );
}
