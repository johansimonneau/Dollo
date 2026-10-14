import { dueDailyMed, dueReminders, nextFeedAt, type ReminderPrefs } from '../../supabase/functions/_shared/reminders';
import { Icon, KIND_ICON } from '../components/icons';
import { eventTitle, FEVER_C, fmtTemp, fmtVolume, SIDE_LABEL } from '../lib/labels';
import { summarize, lastOf, ongoing, suggestNextSide } from '../lib/summary';
import { DAY, HOUR, MINUTE, fmtClock, fmtDuration, fmtTimer, timeAgo } from '../lib/time';
import type { BabyEvent, BreastSide, EventKind, MilkBag } from '../lib/types';
import { activeBags, milkStatus, stockTotals } from '../lib/milk';
import { fmtLimit } from '../components/MilkStock';


export interface TodayActions {
  startBreast: (side: BreastSide) => void;
  stop: (event: BabyEvent) => void;
  toggleSleep: () => void;
  openDiaper: () => void;
  openBottle: () => void;
  openTemp: () => void;
  openMed: () => void;
  openPump: () => void;
  openMilk: () => void;
  /** Dictée (null si le navigateur ne la gère pas). */
  voice: { listening: boolean; start: () => void; stop: () => void } | null;
  edit: (event: BabyEvent) => void;
}

interface Props {
  events: BabyEvent[];
  now: number;
  actions: TodayActions;
  reminderPrefs?: ReminderPrefs;
  /** Pour adapter le conseil en cas de fièvre (avant 3 mois : consulter sans attendre). */
  birthDate?: string | null;
  /** « Vaccins des 2 mois : prévus vers le 1 oct. 2026 » (parents), ou null. */
  vaccinesDue?: string | null;
  /** Stock de lait tiré (carte + alerte de date limite). */
  milkBags?: MilkBag[];
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

export function Today({ events, now, actions, reminderPrefs, birthDate, vaccinesDue, milkBags = [] }: Props) {
  const running = ongoing(events);
  const nextSide = suggestNextSide(events);
  const sleeping = running.find((e) => e.kind === 'sleep');
  // Fenêtre glissante de 24 h. La borne de fin dépasse `now` : l'horloge de l'écran n'avance que toutes les 15 s, et un
  // événement saisi juste après un tic (heure réelle > `now`) serait sinon exclu jusqu'au prochain.
  const day = summarize(events, now - DAY, now + HOUR, now);
  const daily = reminderPrefs ? dueDailyMed(events, reminderPrefs, now, tz()) : null;
  const due = reminderPrefs ? [...dueReminders(events, reminderPrefs, now), ...(daily ? [daily] : [])] : [];
  // Fièvre : dernière température des 12 dernières heures à 38 °C ou plus.
  const lastTemp = lastOf(events, 'temp');
  const fever = lastTemp && lastTemp.tempC != null && lastTemp.tempC >= FEVER_C && now - new Date(lastTemp.startedAt).getTime() < 12 * HOUR ? lastTemp : null;
  const stock = stockTotals(milkBags, now);
  const hasStock = activeBags(milkBags).length > 0;
  // Lait au frigo / décongelé bientôt périmé (ou à jeter) : le congélateur n'est pas urgent.
  const urgentMilk = activeBags(milkBags).find((b) => b.storage !== 'freezer' && milkStatus(b, now) !== 'ok');
  const underThreeMonths = birthDate ? now - new Date(`${birthDate}T00:00:00`).getTime() < 91 * DAY : false;
  const nextFeed = reminderPrefs ? nextFeedAt(events, reminderPrefs) : null;

  return (
    <div className="screen">
      {running.map((e) => {
        const I = KIND_ICON[e.kind];
        const elapsed = now - new Date(e.startedAt).getTime();
        return (
          <section key={e.id} className={`live-card kind-${e.kind}`} aria-label={`${eventTitle(e)} en cours`}>
            <div className="live-head">
              <span className="badge" aria-hidden="true">
                <I size={22} />
              </span>
              <div>
                <p className="live-title">{e.kind === 'sleep' ? 'Bébé dort' : `${eventTitle(e)} · en cours`}</p>
                <p className="live-sub">depuis {fmtClock(e.startedAt)}</p>
              </div>
            </div>
            <p className="live-timer" role="timer" aria-label={`Durée : ${fmtDuration(elapsed)}`}>
              {fmtTimer(elapsed)}
            </p>
            <div className="live-actions">
              <button type="button" className="btn primary" onClick={() => actions.stop(e)}>
                <Icon.Stop size={18} /> {e.kind === 'sleep' ? 'Réveil' : 'Terminer'}
              </button>
              <button type="button" className="btn ghost" onClick={() => actions.edit(e)}>
                Modifier l'heure
              </button>
            </div>
          </section>
        );
      })}

      {fever && (
        <section className="fever-banner" role="alert" aria-label="Fièvre">
          <Icon.Thermo size={26} />
          <p>
            <strong>
              Fièvre : {fmtTemp(fever.tempC!)} à {fmtClock(fever.startedAt)}
            </strong>
            {underThreeMonths
              ? 'Avant 3 mois, toute fièvre doit être vue rapidement : appelez votre médecin, ou le 15 si vous ne pouvez pas le joindre.'
              : 'Surveillez bébé (boit-il bien ? est-il réactif ?). En cas de doute ou de signe inquiétant, appelez votre médecin ou le 15.'}
          </p>
        </section>
      )}

      {urgentMilk && (
        <button type="button" className="reminder-banner kind-pump banner-btn" onClick={actions.openMilk}>
          <Icon.Drop size={24} />
          <span>
            {milkStatus(urgentMilk, now) === 'expired' ? `Lait périmé à jeter (${urgentMilk.volumeMl} ml)` : `Lait à utiliser ${fmtLimit(urgentMilk)} (${urgentMilk.volumeMl} ml)`}
            <small>Touchez pour voir le stock.</small>
          </span>
        </button>
      )}

      {vaccinesDue && (
        <p className="reminder-banner kind-med" role="status">
          <Icon.Check size={24} />
          <span>
            {vaccinesDue}
            <small>À noter dans Stats → Santé une fois faits.</small>
          </span>
        </p>
      )}

      {due.length > 0 && (
        <section className="reminders" aria-label="Rappels">
          {due.map((r) => (
            <p key={r.kind} className={`reminder-banner kind-${r.kind === 'feed' ? 'bottle' : r.kind === 'diaper' ? 'diaper' : 'med'}`} role="status">
              {r.kind === 'feed' ? <Icon.Bottle size={24} /> : r.kind === 'diaper' ? <Icon.Diaper size={24} /> : <Icon.Pill size={24} />}
              {r.kind === 'daily_med' ? (
                <span>
                  {reminderPrefs?.dailyMed?.name} : pas encore noté aujourd'hui
                  <small>Rappel prévu à {reminderPrefs?.dailyMed?.hour}{'\u00a0'}h</small>
                </span>
              ) : (
                <span>
                  {r.kind === 'feed' ? "C'est bientôt l'heure de manger" : 'Pas de couche mouillée depuis un moment'}
                  <small>
                    {r.kind === 'feed' ? 'Dernier repas' : 'Dernière couche mouillée'} il y a {fmtDuration(now - new Date(r.lastAt).getTime())}
                  </small>
                </span>
              )}
            </p>
          ))}
        </section>
      )}

      <section aria-label="Enregistrer rapidement">
        <div className="section-head">
          <h2 className="section-title">Enregistrer</h2>
          {actions.voice && (
            <button
              type="button"
              className={`voice-btn${actions.voice.listening ? ' on' : ''}`}
              aria-pressed={actions.voice.listening}
              onClick={actions.voice.listening ? actions.voice.stop : actions.voice.start}
            >
              <Icon.Mic size={20} /> {actions.voice.listening ? 'Je vous écoute…' : 'Dicter'}
            </button>
          )}
        </div>
        {actions.voice?.listening && <p className="voice-hint">Dites par exemple « biberon 120 », « couche pipi », « dodo », « température 38,2 ».</p>}
        <div className="quick-grid">
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`quick kind-breast${nextSide === side ? ' suggested' : ''}`}
              onClick={() => actions.startBreast(side)}
            >
              <Icon.Breast size={28} />
              <span className="quick-label">{SIDE_LABEL[side]}</span>
              {nextSide === side && <span className="quick-tag">Prochain</span>}
            </button>
          ))}
          <button type="button" className="quick kind-bottle" onClick={actions.openBottle}>
            <Icon.Bottle size={28} />
            <span className="quick-text">
              <span className="quick-label">Biberon</span>
              {day.bottleMl > 0 && <span className="quick-sub">{fmtVolume(day.bottleMl)}{'\u00a0'}sur{'\u00a0'}24{'\u00a0'}h</span>}
            </span>
          </button>
          <button type="button" className="quick kind-diaper" onClick={actions.openDiaper}>
            <Icon.Diaper size={28} />
            <span className="quick-label">Couche</span>
          </button>
          <button type="button" className={`quick kind-sleep wide${sleeping ? ' active' : ''}`} onClick={actions.toggleSleep}>
            {sleeping ? <Icon.Sun size={28} /> : <Icon.Moon size={28} />}
            <span className="quick-text">
              <span className="quick-label">{sleeping ? 'Réveil' : 'Dodo'}</span>
              {day.sleepMs > 0 && <span className="quick-sub">{fmtDuration(day.sleepMs)}{'\u00a0'}de sommeil sur{'\u00a0'}24{'\u00a0'}h</span>}
            </span>
          </button>
        </div>
        <div className="health-row three">
          <button type="button" className="health-btn kind-temp" onClick={actions.openTemp}>
            <Icon.Thermo size={22} /> Température
          </button>
          <button type="button" className="health-btn kind-med" onClick={actions.openMed}>
            <Icon.Pill size={22} /> Médicament
          </button>
          <button type="button" className="health-btn kind-pump" onClick={actions.openPump}>
            <Icon.Drop size={22} /> Tirage
          </button>
        </div>
        {hasStock && (
          <button type="button" className="milk-card kind-pump" onClick={actions.openMilk}>
            <Icon.Drop size={24} />
            <span>
              <strong>Stock de lait</strong>
              <small>
                Frigo {fmtVolume(stock.fridgeMl)} ({stock.fridgeCount}) · Congélateur {fmtVolume(stock.freezerMl)} ({stock.freezerCount})
              </small>
            </span>
          </button>
        )}
      </section>

      <section aria-label="Depuis la dernière fois">
        <h2 className="section-title">Depuis la dernière fois</h2>
        {nextFeed !== null && nextFeed > now && (
          <p className="next-feed">
            Prochain repas vers <strong>{fmtClock(new Date(nextFeed).toISOString())}</strong>
          </p>
        )}
        <ul className="since-list">
          <SinceRow kind="breast" event={lastOf(events, 'breast')} now={now} onClick={actions.edit} />
          <SinceRow kind="bottle" event={lastOf(events, 'bottle')} now={now} onClick={actions.edit} />
          <SinceRow kind="diaper" event={lastOf(events, 'diaper')} now={now} onClick={actions.edit} />
          <SinceRow kind="sleep" event={lastOf(events, 'sleep')} now={now} onClick={actions.edit} />
          {/* Santé : seulement si quelque chose a déjà été noté (pas de lignes vides pour un bébé en bonne santé). */}
          {lastOf(events, 'med') && <SinceRow kind="med" event={lastOf(events, 'med')} now={now} onClick={actions.edit} />}
          {lastTemp && <SinceRow kind="temp" event={lastTemp} now={now} onClick={actions.edit} />}
          {lastOf(events, 'pump') && <SinceRow kind="pump" event={lastOf(events, 'pump')} now={now} onClick={actions.edit} />}
        </ul>
      </section>

      <section aria-label="Dernières 24 heures">
        <h2 className="section-title">Dernières 24 h</h2>
        <div className="tiles">
          <Tile kind="breast" label="Tétées" value={String(day.breastCount)} detail={day.breastMs > 0 ? fmtDuration(day.breastMs) : '—'} />
          <Tile
            kind="bottle"
            label="Biberons"
            value={day.bottleMl > 0 ? fmtVolume(day.bottleMl) : '—'}
            detail={day.bottleCount > 0 ? `${day.bottleCount}\u00a0biberon${day.bottleCount > 1 ? 's' : ''} · bu sur 24\u00a0h` : 'aucun biberon'}
          />
          <Tile kind="diaper" label="Couches" value={String(day.diaperCount)} detail={`${day.pee} pipi · ${day.poop} caca`} />
          <Tile kind="sleep" label="Sommeil" value={day.sleepMs > 0 ? fmtDuration(day.sleepMs) : '—'} detail="cumul sur 24 h" />
        </div>
      </section>
    </div>
  );
}

const SINCE_LABEL: Record<EventKind, string> = {
  breast: 'Dernière tétée',
  bottle: 'Dernier biberon',
  diaper: 'Dernière couche',
  sleep: 'Sommeil',
  temp: 'Température',
  med: 'Dernier médicament',
  pump: 'Dernier tirage',
};

function SinceRow({ kind, event, now, onClick }: { kind: EventKind; event: BabyEvent | null; now: number; onClick: (e: BabyEvent) => void }) {
  const I = KIND_ICON[kind];
  let main = 'Rien pour l’instant';
  let sub = '';

  if (event) {
    if (kind === 'sleep') {
      if (event.endedAt === null) {
        main = `Dort depuis ${fmtDuration(now - new Date(event.startedAt).getTime())}`;
        sub = `endormi à ${fmtClock(event.startedAt)}`;
      } else {
        const awake = now - new Date(event.endedAt).getTime();
        main = awake < MINUTE ? 'Vient de se réveiller' : `Réveillé depuis ${fmtDuration(awake)}`;
        sub = `réveil à ${fmtClock(event.endedAt)}`;
      }
    } else if (event.endedAt === null && kind === 'breast') {
      main = `${eventTitle(event)} · en cours`;
      sub = `depuis ${fmtClock(event.startedAt)}`;
    } else {
      main = `${eventTitle(event)} · ${timeAgo(event.startedAt, now)}`;
      sub = fmtClock(event.startedAt);
    }
  }

  const content = (
    <>
      <span className="badge" aria-hidden="true">
        <I size={20} />
      </span>
      <span className="since-text">
        <span className="since-kind">{SINCE_LABEL[kind]}</span>
        <span className="since-main">{main}</span>
      </span>
      <span className="since-time">{sub}</span>
    </>
  );

  return (
    <li>
      {event ? (
        <button type="button" className={`since-row kind-${kind}`} onClick={() => onClick(event)}>
          {content}
        </button>
      ) : (
        <div className={`since-row kind-${kind} empty`}>{content}</div>
      )}
    </li>
  );
}

function Tile({ kind, label, value, detail }: { kind: EventKind; label: string; value: string; detail: string }) {
  return (
    <div className={`tile kind-${kind}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      <span className="tile-detail">{detail}</span>
    </div>
  );
}
