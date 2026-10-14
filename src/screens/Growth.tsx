import { useCallback, useEffect, useState } from 'react';
import { GrowthChart, measurementValue } from '../components/GrowthChart';
import { MeasurementSheet } from '../components/MeasurementSheet';
import { useToast } from '../components/toast';
import { errorMessage, type Store } from '../data/store';
import { ageInMonths, fmtPercentile, INDICATOR_LABEL, MAX_MONTHS, percentile, type Indicator } from '../lib/growth';
import { dayKey, fmtDate } from '../lib/time';
import type { Baby, Measurement, NewMeasurement } from '../lib/types';

interface Props {
  store: Store;
  baby: Baby;
  now: number;
  onBabyUpdated: (baby: Baby) => void;
}

const INDICATORS: Indicator[] = ['weight', 'length', 'head'];


const fmtValue = (m: Measurement, i: Indicator) => {
  const v = measurementValue(m, i);
  if (v === null) return null;
  return i === 'weight' ? `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg` : `${v.toLocaleString('fr-FR')} cm`;
};

/** Courbes de croissance (OMS) et historique des mesures. Réservé aux parents. */
export function Growth({ store, baby, now, onBabyUpdated }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Measurement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<Indicator>('weight');
  const [sheet, setSheet] = useState<{ m?: Measurement } | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await store.listMeasurements(baby.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [store, baby.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const setSex = async (sex: 'f' | 'm') => {
    try {
      onBabyUpdated(await store.updateBaby(baby.id, { name: baby.name, birthDate: baby.birthDate, sex }));
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    }
  };

  const save = async (m: NewMeasurement) => {
    if (sheet?.m) await store.updateMeasurement(sheet.m.id, m);
    else await store.addMeasurement(m);
    setSheet(null);
    toast.show('Mesure enregistrée.');
    await load();
  };

  const remove = async () => {
    if (!sheet?.m) return;
    await store.deleteMeasurement(sheet.m.id);
    setSheet(null);
    toast.show('Mesure supprimée.');
    await load();
  };

  if (error) return <p className="form-error">Mesures indisponibles : {error}</p>;
  if (!baby.birthDate) {
    return (
      <section className="card pad">
        <p className="hint">Renseignez la date de naissance de {baby.name} (Réglages) pour afficher ses courbes de croissance.</p>
      </section>
    );
  }

  const nowMonths = ageInMonths(baby.birthDate, dayKey(now));
  const sex = baby.sex ?? null;
  const list = items ?? [];
  const withValue = list.filter((m) => measurementValue(m, indicator) !== null);
  const last = withValue.at(-1);
  const lastP = last && sex ? percentile(indicator, sex, ageInMonths(baby.birthDate, last.measuredOn), measurementValue(last, indicator)!) : null;

  return (
    <div className="growth">
      {!sex && (
        <section className="card pad">
          <p className="hint">Les courbes de référence de l'OMS sont différentes pour les filles et les garçons.</p>
          <div className="segmented" role="group" aria-label="Sexe de bébé">
            <button type="button" aria-pressed={false} onClick={() => void setSex('f')}>
              Fille
            </button>
            <button type="button" aria-pressed={false} onClick={() => void setSex('m')}>
              Garçon
            </button>
          </div>
        </section>
      )}

      <div className="segmented" role="group" aria-label="Courbe affichée">
        {INDICATORS.map((i) => (
          <button key={i} type="button" aria-pressed={indicator === i} onClick={() => setIndicator(i)}>
            {i === 'head' ? 'Crâne' : INDICATOR_LABEL[i]}
          </button>
        ))}
      </div>

      <section className="card pad">
        <h2 className="section-title flush">{INDICATOR_LABEL[indicator]}</h2>
        {last ? (
          <p className="growth-last">
            <strong>{fmtValue(last, indicator)}</strong> le {fmtDate(last.measuredOn)}
            {lastP !== null && <span> · {fmtPercentile(lastP)}</span>}
          </p>
        ) : (
          <p className="hint">Aucune mesure pour l'instant.</p>
        )}
        {sex && nowMonths <= MAX_MONTHS + 1 ? (
          <GrowthChart indicator={indicator} sex={sex} birthDate={baby.birthDate} measurements={list} nowMonths={nowMonths} />
        ) : sex ? (
          <p className="hint">Les courbes OMS affichées ici couvrent 0 à 24 mois.</p>
        ) : null}
        {sex && <p className="growth-legend">Zone foncée : 15e–85e percentile · zone claire : 3e–97e · trait : médiane (OMS)</p>}
      </section>

      <button type="button" className="btn primary block" onClick={() => setSheet({})}>
        Ajouter une mesure
      </button>

      {list.length > 0 && (
        <section className="card" aria-label="Historique des mesures">
          <ul className="measure-list">
            {[...list].reverse().map((m) => {
              const months = ageInMonths(baby.birthDate!, m.measuredOn);
              return (
                <li key={m.id}>
                  <button type="button" className="measure-row" onClick={() => setSheet({ m })}>
                    <span className="measure-date">{fmtDate(m.measuredOn)}</span>
                    <span className="measure-values">
                      {INDICATORS.map((i) => {
                        const v = fmtValue(m, i);
                        if (!v) return null;
                        const p = sex ? percentile(i, sex, months, measurementValue(m, i)!) : null;
                        return (
                          <span key={i}>
                            {i === 'weight' ? 'Poids' : i === 'length' ? 'Taille' : 'PC'} {v}
                            {p !== null && <small> · {fmtPercentile(p).replace(' percentile', '')}</small>}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="lp-note growth-disclaimer">Repères indicatifs : seul votre médecin peut interpréter la croissance de votre enfant.</p>

      {sheet && (
        <MeasurementSheet
          key={sheet.m?.id ?? 'new'}
          babyId={baby.id}
          birthDate={baby.birthDate}
          measurement={sheet.m}
          onSave={save}
          onDelete={sheet.m ? remove : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
