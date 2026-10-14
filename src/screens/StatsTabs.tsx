import { useState } from 'react';
import type { Store } from '../data/store';
import type { Baby, BabyEvent } from '../lib/types';
import { Growth } from './Growth';
import { Stats } from './Stats';

interface Props {
  store: Store;
  baby: Baby;
  events: BabyEvent[];
  now: number;
  onBabyUpdated: (baby: Baby) => void;
}

/** Onglet Stats : l'activité des 7 derniers jours, ou la croissance (courbes OMS). */
export function StatsTabs({ store, baby, events, now, onBabyUpdated }: Props) {
  const [view, setView] = useState<'activity' | 'growth'>('activity');
  return (
    <div className="screen">
      <div className="segmented stats-switch" role="group" aria-label="Statistiques">
        <button type="button" aria-pressed={view === 'activity'} onClick={() => setView('activity')}>
          Activité
        </button>
        <button type="button" aria-pressed={view === 'growth'} onClick={() => setView('growth')}>
          Croissance
        </button>
      </div>
      {view === 'activity' ? <Stats events={events} now={now} /> : <Growth store={store} baby={baby} now={now} onBabyUpdated={onBabyUpdated} />}
    </div>
  );
}
