import { useEffect, useState } from 'react';
import { DIAPER_CHOICES, FEED_CHOICES, type ReminderPrefs } from '../../supabase/functions/_shared/reminders';
import { errorMessage, type Store } from '../data/store';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import type { Baby } from '../lib/types';
import { useToast } from './toast';

interface Props {
  store: Store;
  baby: Baby;
  prefs: ReminderPrefs;
  onPrefsChange: (prefs: ReminderPrefs) => void;
}

const DAILY_HOURS = [8, 9, 12, 18, 20];

const fmtInterval = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`;
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

/** Réglages de rappels (repas, couche, nuit) et activation des notifications sur ce téléphone. */
export function RemindersSettings({ store, baby, prefs, onPrefsChange }: Props) {
  const toast = useToast();
  const [push, setPush] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  useEffect(() => setPush(pushState()), []);

  const save = async (next: ReminderPrefs) => {
    const previous = prefs;
    onPrefsChange(next); // affichage immédiat ; on revient en arrière si l'enregistrement échoue
    try {
      await store.saveReminderPrefs(baby.id, next, timeZone());
    } catch (e) {
      onPrefsChange(previous);
      toast.show(errorMessage(e), { tone: 'error' });
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const state = await enablePush(store);
      setPush(state);
      if (state === 'granted') toast.show('Notifications activées sur ce téléphone.');
      else if (state === 'denied') toast.show('Notifications refusées. Autorisez-les dans les réglages du téléphone.', { tone: 'error', durationMs: 8000 });
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush(store);
      setPush('default');
      toast.show('Notifications désactivées sur ce téléphone.');
    } catch (e) {
      toast.show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const anyReminder = prefs.feedEveryMin !== null || prefs.diaperDryHours !== null || !!prefs.dailyMed;

  return (
    <section className="card pad" aria-label="Rappels">
      <h2 className="section-title flush">Rappels</h2>

      <div className="field">
        <span className="label" id="feed-label">
          Prochain repas
        </span>
        <span className="hint">Compté depuis le début de la dernière tétée ou du dernier biberon.</span>
        <div className="chips" role="group" aria-labelledby="feed-label">
          <button type="button" className="chip" aria-pressed={prefs.feedEveryMin === null} onClick={() => void save({ ...prefs, feedEveryMin: null })}>
            Non
          </button>
          {FEED_CHOICES.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={prefs.feedEveryMin === m} onClick={() => void save({ ...prefs, feedEveryMin: m })}>
              {fmtInterval(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label" id="diaper-label">
          Pas de couche mouillée depuis
        </span>
        <div className="chips" role="group" aria-labelledby="diaper-label">
          <button type="button" className="chip" aria-pressed={prefs.diaperDryHours === null} onClick={() => void save({ ...prefs, diaperDryHours: null })}>
            Non
          </button>
          {DIAPER_CHOICES.map((h) => (
            <button key={h} type="button" className="chip" aria-pressed={prefs.diaperDryHours === h} onClick={() => void save({ ...prefs, diaperDryHours: h })}>
              {h}
              {' '}h
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label" id="daily-label">
          Traitement quotidien
        </span>
        {prefs.dailyMed ? (
          <>
            <input
              className="input"
              aria-label="Nom du traitement"
              defaultValue={prefs.dailyMed.name}
              maxLength={60}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== prefs.dailyMed?.name) void save({ ...prefs, dailyMed: { name, hour: prefs.dailyMed!.hour } });
              }}
            />
            <div className="chips" role="group" aria-labelledby="daily-label">
              {DAILY_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="chip"
                  aria-pressed={prefs.dailyMed?.hour === h}
                  onClick={() => void save({ ...prefs, dailyMed: { name: prefs.dailyMed!.name, hour: h } })}
                >
                  {h}
                  {'\u00a0'}h
                </button>
              ))}
            </div>
            <span className="hint">Rappel à cette heure s'il n'a pas été noté dans la journée (bouton « Médicament »).</span>
            <button type="button" className="link-btn danger left" onClick={() => void save({ ...prefs, dailyMed: null })}>
              Retirer ce rappel
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => void save({ ...prefs, dailyMed: { name: 'Vitamine D', hour: 9 } })}>
            Ajouter un rappel (ex. vitamine D)
          </button>
        )}
      </div>

      <label className="check">
        <input type="checkbox" checked={prefs.quietNight} onChange={(e) => void save({ ...prefs, quietNight: e.target.checked })} />
        <span>Pas de notification la nuit (22 h – 7 h)</span>
      </label>

      <div className="push-box">
        {push === 'granted' ? (
          <>
            <p className="hint">
              <strong>Notifications activées sur ce téléphone.</strong> {anyReminder ? 'Vous serez prévenu même app fermée.' : 'Choisissez un rappel ci-dessus.'}
            </p>
            <button type="button" className="link-btn" disabled={busy} onClick={() => void disable()}>
              Désactiver sur ce téléphone
            </button>
          </>
        ) : push === 'default' ? (
          <>
            <p className="hint">Sans notification, les rappels s'affichent seulement quand l'app est ouverte.</p>
            <button type="button" className="btn primary" disabled={busy || store.mode !== 'cloud'} onClick={() => void enable()}>
              Activer les notifications
            </button>
          </>
        ) : (
          <p className="hint">{PUSH_HINT[push]}</p>
        )}
      </div>
    </section>
  );
}

const PUSH_HINT: Record<Exclude<PushState, 'granted' | 'default'>, string> = {
  unconfigured: "Les rappels s'affichent dans l'app. Les notifications (app fermée) ne sont pas encore activées sur ce service.",
  unsupported: "Ce navigateur ne gère pas les notifications : les rappels s'affichent dans l'app.",
  'needs-install':
    "Sur iPhone, les notifications ne fonctionnent qu'une fois Dollo ajoutée à l'écran d'accueil (Safari → Partager → Sur l'écran d'accueil). Ouvrez-la ensuite depuis son icône.",
  denied: "Notifications bloquées pour Dollo. Réactivez-les dans les réglages du téléphone (Notifications → Dollo), puis revenez ici.",
};
