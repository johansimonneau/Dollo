import { Icon } from '../components/icons';
import { eventTitle, fmtLiters, SIDE_LABEL, summaryText } from '../lib/labels';
import { summarize, lastOf, ongoing, suggestNextSide } from '../lib/summary';
import { DAY, HOUR, MINUTE, fmtClock, fmtDuration, fmtTimer, timeAgo } from '../lib/time';
import type { BabyEvent, BreastSide, EventKind } from '../lib/types';

const KIND_ICON = { breast: Icon.Breast, bottle: Icon.Bottle, diaper: Icon.Diaper, sleep: Icon.Moon } as const;

export interface TodayActions {
  startBreast: (side: BreastSide) => void;
  stop: (event: BabyEvent) => void;
  toggleSleep: () => void;
  openDiaper: () => void;
  openBottle: () => void;
  edit: (event: BabyEvent) => void;
}

interface Props {
  events: BabyEvent[];
  now: number;
  actions: TodayActions;
}

export function Today({ events, now, actions }: Props) {
  const running = ongoing(events);
  const nextSide = suggestNextSide(events);
  const sleeping = running.find((e) => e.kind === 'sleep');
  // Fenêtre glissante de 24 h. La borne de fin dépasse `now` : l'horloge de l'écran n'avance que toutes les 15 s, et un
  // événement saisi juste après un tic (heure réelle > `now`) serait sinon exclu jusqu'au prochain.
  const day = summarize(events, now - DAY, now + HOUR, now);

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

      <section aria-label="Enregistrer rapidement">
        <h2 className="section-title">Enregistrer</h2>
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
              {day.bottleMl > 0 && <span className="quick-sub">{fmtLiters(day.bottleMl)}{'\u00a0'}sur{'\u00a0'}24{'\u00a0'}h</span>}
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
      </section>

      <section aria-label="Depuis la dernière fois">
        <h2 className="section-title">Depuis la dernière fois</h2>
        <ul className="since-list">
          <SinceRow kind="breast" event={lastOf(events, 'breast')} now={now} onClick={actions.edit} />
          <SinceRow kind="bottle" event={lastOf(events, 'bottle')} now={now} onClick={actions.edit} />
          <SinceRow kind="diaper" event={lastOf(events, 'diaper')} now={now} onClick={actions.edit} />
          <SinceRow kind="sleep" event={lastOf(events, 'sleep')} now={now} onClick={actions.edit} />
        </ul>
      </section>

      <section aria-label="Dernières 24 heures">
        <h2 className="section-title">Dernières 24 h</h2>
        <div className="tiles">
          <Tile kind="breast" label="Tétées" value={String(day.breastCount)} detail={day.breastMs > 0 ? fmtDuration(day.breastMs) : '—'} />
          <Tile
            kind="bottle"
            label="Biberons"
            value={day.bottleMl > 0 ? fmtLiters(day.bottleMl) : '—'}
            detail={day.bottleCount > 0 ? summaryText('bottle', day) : 'aucun biberon'}
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
