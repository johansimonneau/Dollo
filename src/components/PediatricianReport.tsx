import { useEffect, useState } from 'react';
import { errorMessage, type Store } from '../data/store';
import { ageInMonths, fmtPercentile, INDICATOR_LABEL, percentile, type Indicator } from '../lib/growth';
import { FEVER_C, fmtTemp, fmtVolume } from '../lib/labels';
import { VACCINE_CALENDAR } from '../lib/vaccines';
import { dailySeries, type Summary } from '../lib/summary';
import { babyAge, dayKey, DAY, fmtClock, fmtDate, fmtDuration } from '../lib/time';
import type { Baby, BabyEvent, Measurement, Vaccination } from '../lib/types';
import { GrowthChart, measurementValue } from './GrowthChart';

interface Props {
  store: Store;
  baby: Baby;
  events: BabyEvent[];
  now: number;
  onClose: () => void;
}

const DAYS = 7;
const INDICATORS: Indicator[] = ['weight', 'length', 'head'];
const unitValue = (m: Measurement, i: Indicator) => {
  const v = measurementValue(m, i);
  return v === null ? '—' : i === 'weight' ? `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} kg` : `${v.toLocaleString('fr-FR')} cm`;
};

/**
 * Rapport d'une page pour la consultation : 7 derniers jours (alimentation, couches, sommeil), mesures avec percentiles
 * OMS, courbes et notes. « Imprimer / PDF » ouvre la fenêtre d'impression du téléphone (« Enregistrer en PDF »).
 */
export function PediatricianReport({ store, baby, events, now, onClose }: Props) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [vaccines, setVaccines] = useState<Vaccination[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    store
      .listMeasurements(baby.id)
      .then(setMeasurements)
      .catch((e) => setError(errorMessage(e)));
    store
      .listVaccinations(baby.id)
      .then(setVaccines)
      .catch(() => undefined); // base pas encore migrée : section vaccins absente
  }, [store, baby.id]);

  useEffect(() => {
    document.documentElement.classList.add('report-open');
    return () => document.documentElement.classList.remove('report-open');
  }, []);

  const series = dailySeries(events, DAYS, now);
  // Moyennes sur les jours COMPLETS ayant des données (aujourd'hui est partiel), comme l'écran Stats.
  const complete = series
    .slice(0, -1)
    .map((d) => d.summary)
    .filter((s) => s.breastCount + s.bottleCount + s.diaperCount + s.sleepCount > 0);
  const avg = (pick: (s: Summary) => number) => (complete.length ? complete.reduce((t, s) => t + pick(s), 0) / complete.length : null);
  const fmtAvg = (v: number | null) => (v === null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
  const bottleMlAvg = avg((s) => s.bottleMl);
  const sleepAvg = avg((s) => s.sleepMs);
  const since = now - DAYS * DAY;
  const temps = events.filter((e) => e.kind === 'temp' && e.tempC != null && new Date(e.startedAt).getTime() >= since);
  const meds = events.filter((e) => e.kind === 'med' && new Date(e.startedAt).getTime() >= since);
  const pumps = events.filter((e) => e.kind === 'pump' && new Date(e.startedAt).getTime() >= since);
  const pumpMl = pumps.reduce((t, e) => t + (e.amountMl ?? 0), 0);
  const doneVaccines = VACCINE_CALENDAR.filter((d) => vaccines.some((v) => v.code === d.code)).map((d) => ({
    dose: d,
    on: vaccines.find((v) => v.code === d.code)!.givenOn,
  }));
  const notes = events.filter((e) => e.note && new Date(e.startedAt).getTime() >= now - DAYS * DAY).slice(0, 12);
  const age = babyAge(baby.birthDate, now);
  const sex = baby.sex ?? null;
  const nowMonths = baby.birthDate ? ageInMonths(baby.birthDate, dayKey(now)) : 0;

  return (
    <div className="report" role="dialog" aria-modal="true" aria-label="Rapport pour le pédiatre">
      <div className="report-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Fermer
        </button>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>

      <article className="report-page">
        <header className="report-head">
          <div>
            <h1>{baby.name}</h1>
            <p>
              {[baby.birthDate && `Né${sex === 'f' ? 'e' : sex === 'm' ? '' : '(e)'} le ${fmtDate(baby.birthDate)}`, age, sex === 'f' ? 'Fille' : sex === 'm' ? 'Garçon' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <p className="report-meta">
            Rapport Dollo du {fmtDate(dayKey(now))}
            <br />7 derniers jours
          </p>
        </header>

        <section>
          <h2>Les 7 derniers jours</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Tétées</th>
                <th>Biberons</th>
                <th>Couches (pipi / caca)</th>
                <th>Sommeil</th>
              </tr>
            </thead>
            <tbody>
              {series.map(({ key, summary: s }) => (
                <tr key={key}>
                  <td>{fmtDate(key)}</td>
                  <td>
                    {s.breastCount}
                    {s.breastMs > 0 && <small> · {fmtDuration(s.breastMs)}</small>}
                  </td>
                  <td>
                    {s.bottleCount}
                    {s.bottleMl > 0 && <small> · {fmtVolume(s.bottleMl)}</small>}
                  </td>
                  <td>
                    {s.diaperCount} <small>({s.pee} / {s.poop})</small>
                  </td>
                  <td>{s.sleepMs > 0 ? fmtDuration(s.sleepMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Moyenne / jour{complete.length > 0 && <small> ({complete.length} j)</small>}</td>
                <td>{fmtAvg(avg((s) => s.breastCount))}</td>
                <td>
                  {fmtAvg(avg((s) => s.bottleCount))}
                  {bottleMlAvg ? <small> · {fmtVolume(Math.round(bottleMlAvg))}</small> : null}
                </td>
                <td>{fmtAvg(avg((s) => s.diaperCount))}</td>
                <td>{sleepAvg ? fmtDuration(sleepAvg) : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <p className="report-note">Moyennes calculées sur les jours complets notés (le jour en cours est partiel). Quantités de biberon : ce que bébé a bu.</p>
        </section>

        <section>
          <h2>Croissance</h2>
          {error && <p className="form-error">Mesures indisponibles : {error}</p>}
          {measurements.length === 0 ? (
            <p className="report-note">Aucune mesure enregistrée.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {INDICATORS.map((i) => (
                    <th key={i}>{INDICATOR_LABEL[i]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...measurements].reverse().map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.measuredOn)}</td>
                    {INDICATORS.map((i) => {
                      const v = measurementValue(m, i);
                      const p = v !== null && sex && baby.birthDate ? percentile(i, sex, ageInMonths(baby.birthDate, m.measuredOn), v) : null;
                      return (
                        <td key={i}>
                          {unitValue(m, i)}
                          {p !== null && <small> · {fmtPercentile(p).replace(' percentile', ' p.')}</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sex && baby.birthDate && measurements.length > 0 && (
            <div className="report-charts">
              {INDICATORS.map((i) => (
                <figure key={i}>
                  <figcaption>{INDICATOR_LABEL[i]}</figcaption>
                  <GrowthChart indicator={i} sex={sex} birthDate={baby.birthDate!} measurements={measurements} nowMonths={nowMonths} />
                </figure>
              ))}
            </div>
          )}
          {sex && <p className="report-note">Courbes de référence OMS (3e, 15e, 50e, 85e, 97e percentiles).</p>}
        </section>

        {pumps.length > 0 && (
          <section>
            <h2>Tire-lait (7 derniers jours)</h2>
            <p>
              {pumps.length} tirage{pumps.length > 1 ? 's' : ''}
              {pumpMl > 0 && ` · ${fmtVolume(pumpMl)} au total, soit ${fmtVolume(Math.round(pumpMl / DAYS))} par jour en moyenne`}
            </p>
          </section>
        )}

        {(temps.length > 0 || meds.length > 0) && (
          <section>
            <h2>Santé (7 derniers jours)</h2>
            {temps.length > 0 && (
              <p>
                <strong>Températures :</strong>{' '}
                {temps
                  .map((e) => `${fmtTemp(e.tempC!)} le ${fmtDate(dayKey(e.startedAt))} à ${fmtClock(e.startedAt)}${e.tempC! >= FEVER_C ? ' (fièvre)' : ''}`)
                  .join(' ; ')}
              </p>
            )}
            {meds.length > 0 && (
              <p>
                <strong>Médicaments :</strong>{' '}
                {meds.map((e) => `${e.medName}${e.medDose ? ` ${e.medDose}` : ''} le ${fmtDate(dayKey(e.startedAt))} à ${fmtClock(e.startedAt)}`).join(' ; ')}
              </p>
            )}
          </section>
        )}

        {doneVaccines.length > 0 && (
          <section>
            <h2>Vaccins notés par les parents</h2>
            <ul className="report-notes">
              {doneVaccines.map(({ dose, on }) => (
                <li key={dose.code}>
                  <strong>{fmtDate(on)}</strong> {dose.label} ({dose.detail})
                </li>
              ))}
            </ul>
          </section>
        )}

        {notes.length > 0 && (
          <section>
            <h2>Notes des parents</h2>
            <ul className="report-notes">
              {notes.map((e) => (
                <li key={e.id}>
                  <strong>
                    {fmtDate(dayKey(e.startedAt))} {fmtClock(e.startedAt)}
                  </strong>{' '}
                  {e.note}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="report-foot">Données saisies par les parents dans Dollo. Ce document ne remplace pas un avis médical.</footer>
      </article>
    </div>
  );
}
