import { useState } from 'react';
import { EventRow } from '../components/EventRow';
import { Icon } from '../components/icons';
import { summarizeDay } from '../lib/summary';
import { dayKey, fmtDayLabel, fmtDuration, shiftDay } from '../lib/time';
import type { BabyEvent } from '../lib/types';
import { HISTORY_DAYS } from '../lib/useEvents';

interface Props {
  events: BabyEvent[];
  now: number;
  onEdit: (event: BabyEvent) => void;
  onAdd: () => void;
}

export function Journal({ events, now, onEdit, onAdd }: Props) {
  const today = dayKey(now);
  const [key, setKey] = useState(today);
  const oldest = shiftDay(today, -(HISTORY_DAYS - 1));

  const items = events.filter((e) => dayKey(e.startedAt) === key); // déjà triés du plus récent au plus ancien
  const s = summarizeDay(events, key, now);

  return (
    <div className="screen">
      <div className="day-nav">
        <button type="button" className="icon-btn" aria-label="Jour précédent" disabled={key <= oldest} onClick={() => setKey(shiftDay(key, -1))}>
          <Icon.ChevronLeft />
        </button>
        <h2 className="day-label">{fmtDayLabel(key, now)}</h2>
        <button type="button" className="icon-btn" aria-label="Jour suivant" disabled={key >= today} onClick={() => setKey(shiftDay(key, 1))}>
          <Icon.ChevronRight />
        </button>
      </div>

      <p className="day-summary">
        <span className="pill kind-breast">{s.breastCount} tétée{s.breastCount > 1 ? 's' : ''}</span>
        <span className="pill kind-bottle">{s.bottleCount} biberon{s.bottleCount > 1 ? 's' : ''}{s.bottleMl > 0 ? ` · ${s.bottleMl} ml` : ''}</span>
        <span className="pill kind-diaper">{s.diaperCount} couche{s.diaperCount > 1 ? 's' : ''}</span>
        <span className="pill kind-sleep">{s.sleepMs > 0 ? fmtDuration(s.sleepMs) : '0 min'} de sommeil</span>
      </p>

      <button type="button" className="btn add-past" onClick={onAdd}>
        <Icon.Plus size={20} /> Ajouter un événement passé
      </button>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Rien de noté ce jour-là.</p>
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
