import { useState } from 'react';
import { PlusTag, usePremium } from '../components/premium';
import { LockedFeature } from '../components/PlusCards';
import type { Store } from '../data/store';
import type { Baby, BabyEvent } from '../lib/types';
import { Growth } from './Growth';
import { Health } from './Health';
import { Stats } from './Stats';

interface Props {
  store: Store;
  baby: Baby;
  events: BabyEvent[];
  now: number;
  onBabyUpdated: (baby: Baby) => void;
  onVaccinesChanged?: () => void;
}

/** Onglet Stats : l'activité des 7 derniers jours, la croissance (courbes OMS) ou la santé (vaccins, fièvre, médicaments). */
export function StatsTabs({ store, baby, events, now, onBabyUpdated, onVaccinesChanged }: Props) {
  const [view, setView] = useState<'activity' | 'growth' | 'health'>('activity');
  const premium = usePremium();
  const growth = premium.has('growth');
  return (
    <div className="screen">
      <div className="segmented stats-switch" role="group" aria-label="Statistiques">
        <button type="button" aria-pressed={view === 'activity'} onClick={() => setView('activity')}>
          Activité
        </button>
        <button type="button" aria-pressed={view === 'growth'} onClick={() => setView('growth')}>
          Croissance {!growth && <PlusTag />}
        </button>
        <button type="button" aria-pressed={view === 'health'} onClick={() => setView('health')}>
          Santé
        </button>
      </div>
      {view === 'activity' && <Stats events={events} now={now} />}
      {view === 'growth' && !growth && <LockedFeature feature="growth" />}
      {view === 'growth' && growth && <Growth store={store} baby={baby} now={now} onBabyUpdated={onBabyUpdated} />}
      {view === 'health' && <Health store={store} baby={baby} events={events} now={now} onVaccinesChanged={onVaccinesChanged} />}
    </div>
  );
}
