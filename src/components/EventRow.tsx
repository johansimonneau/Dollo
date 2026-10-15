import { eventTitle } from '../lib/labels';
import { fmtClock, fmtDuration } from '../lib/time';
import type { BabyEvent } from '../lib/types';
import { Icon, KIND_ICON } from './icons';


export function eventSubtitle(e: BabyEvent, nowMs: number): string {
  const start = new Date(e.startedAt).getTime();
  if (e.endedAt) {
    const end = new Date(e.endedAt).getTime();
    return `${fmtClock(e.startedAt)} → ${fmtClock(e.endedAt)} · ${fmtDuration(end - start)}`;
  }
  if (e.kind === 'breast' || e.kind === 'sleep') return `${fmtClock(e.startedAt)} · en cours depuis ${fmtDuration(nowMs - start)}`;
  return fmtClock(e.startedAt);
}

interface Props {
  event: BabyEvent;
  now: number;
  onClick: (e: BabyEvent) => void;
  /** Noté par la nounou (affiché aux parents). */
  byNanny?: boolean;
}

export function EventRow({ event, now, onClick, byNanny }: Props) {
  const I = KIND_ICON[event.kind];
  return (
    <li>
      <button type="button" className={`event-row kind-${event.kind}`} onClick={() => onClick(event)}>
        <span className="badge" aria-hidden="true">
          <I size={22} />
        </span>
        <span className="event-text">
          <span className="event-title">{eventTitle(event)}</span>
          <span className="event-sub">
            {eventSubtitle(event, now)}
            {byNanny && <span className="by-nanny"> · par la nounou</span>}
          </span>
          {event.note && <span className="event-note">{event.note}</span>}
        </span>
        <Icon.ChevronRight size={18} />
      </button>
    </li>
  );
}
