import { useState } from 'react';
import { EventRow } from '../components/EventRow';
import { Icon } from '../components/icons';
import { summaryText } from '../lib/labels';
import { groupByDay, summarize, summarizeDay } from '../lib/summary';
import { dayBounds, dayKey, fmtDayLabel, shiftDay } from '../lib/time';
import type { BabyEvent, EventKind } from '../lib/types';
import { HISTORY_DAYS } from '../lib/useEvents';

const KINDS: EventKind[] = ['breast', 'bottle', 'diaper', 'sleep'];

interface Props {
  events: BabyEvent[];
  now: number;
  onEdit: (event: BabyEvent) => void;
  onAdd: () => void;
}

export function Journal({ events, now, onEdit, onAdd }: Props) {
  const today = dayKey(now);
  const [key, setKey] = useState(today);
  // Types affichés ; vide = tout. Cumulable (ex. biberons + couches).
  const [filter, setFilter] = useState<EventKind[]>([]);
  const oldest = shiftDay(today, -(HISTORY_DAYS - 1));
  const filtering = filter.length > 0;
  const activeKinds = KINDS.filter((k) => filter.includes(k));

  const toggle = (kind: EventKind) =>
    setFilter((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));

  // Sans filtre : le jour affiché. Avec filtre : tous les jours chargés, regroupés par jour.
  // Les pastilles résument toujours ce qui est affiché.
  const scope = filtering
    ? summarize(events, dayBounds(oldest)[0], dayBounds(today)[1], now)
    : summarizeDay(events, key, now);
  const items = filtering ? events.filter((e) => filter.includes(e.kind)) : events.filter((e) => dayKey(e.startedAt) === key); // `events` est déjà trié du plus récent au plus ancien

  return (
    <div className="screen">
      {filtering ? (
        <div className="filter-banner">
          <p>
            <strong>Tous les jours</strong>
            <small>{HISTORY_DAYS} derniers jours</small>
          </p>
          <button type="button" className="link-btn" onClick={() => setFilter([])}>
            Tout afficher
          </button>
        </div>
      ) : (
        <div className="day-nav">
          <button type="button" className="icon-btn" aria-label="Jour précédent" disabled={key <= oldest} onClick={() => setKey(shiftDay(key, -1))}>
            <Icon.ChevronLeft />
          </button>
          <h2 className="day-label">{fmtDayLabel(key, now)}</h2>
          <button type="button" className="icon-btn" aria-label="Jour suivant" disabled={key >= today} onClick={() => setKey(shiftDay(key, 1))}>
            <Icon.ChevronRight />
          </button>
        </div>
      )}

      <div className="filters" role="group" aria-label="Filtrer le journal par type">
        {KINDS.map((k) => (
          <button key={k} type="button" className={`pill kind-${k}`} aria-pressed={filter.includes(k)} onClick={() => toggle(k)}>
            {summaryText(k, scope)}
          </button>
        ))}
      </div>
      {!filtering && <p className="hint filter-hint">Touchez un type pour filtrer sur tous les jours.</p>}

      <button type="button" className="btn add-past" onClick={onAdd}>
        <Icon.Plus size={20} /> Ajouter un événement passé
      </button>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>{filtering ? `Aucun événement de ce type sur les ${HISTORY_DAYS} derniers jours.` : 'Rien de noté ce jour-là.'}</p>
        </div>
      ) : filtering ? (
        <div className="day-groups">
          {groupByDay(items).map((g) => {
            const day = summarizeDay(events, g.key, now);
            return (
              <section key={g.key} aria-label={fmtDayLabel(g.key, now)}>
                <h3 className="group-head">
                  <span>{fmtDayLabel(g.key, now)}</span>
                  <span className="group-total">{activeKinds.map((k) => summaryText(k, day)).join(' · ')}</span>
                </h3>
                <ul className="event-list">
                  {g.events.map((e) => (
                    <EventRow key={e.id} event={e} now={now} onClick={onEdit} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="event-list">
          {items.map((e) => (
            <EventRow key={e.id} event={e} now={now} onClick={onEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}
