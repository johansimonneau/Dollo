import { useCallback, useEffect, useState } from 'react';
import { errorMessage, type Store } from './data/store';
import type { Baby } from './lib/types';
import { Shell } from './Shell';
import { Onboarding } from './screens/Onboarding';

const BABY_KEY = 'dollo:baby';
const readSelected = () => {
  try {
    return localStorage.getItem(BABY_KEY);
  } catch {
    return null;
  }
};

interface Props {
  store: Store;
  email: string | null;
  onSignOut: (() => void) | null;
}

export function BabyGate({ store, email, onSignOut }: Props) {
  const [babies, setBabies] = useState<Baby[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setError(null);
    store
      .listBabies()
      .then(setBabies)
      .catch((e) => setError(errorMessage(e)));
  }, [store]);

  useEffect(load, [load]);

  const select = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(BABY_KEY, id);
    } catch {
      /* préférence non vitale */
    }
  };

  if (error) {
    return (
      <main className="splash">
        <p className="form-error">Impossible de charger vos données : {error}</p>
        <button type="button" className="btn primary" onClick={load}>
          Réessayer
        </button>
      </main>
    );
  }
  if (!babies) return <Splash />;

  const baby = babies.find((b) => b.id === selectedId) ?? babies[0] ?? null;

  if (!baby || adding) {
    return (
      <Onboarding
        store={store}
        first={!baby}
        onCancel={baby ? () => setAdding(false) : undefined}
        onDone={(b) => {
          setBabies((prev) => [...(prev ?? []).filter((x) => x.id !== b.id), b]);
          select(b.id);
          setAdding(false);
        }}
      />
    );
  }

  return (
    <Shell
      store={store}
      babies={babies}
      baby={baby}
      email={email}
      onSelectBaby={select}
      onBabyUpdated={(b) => setBabies((prev) => (prev ?? []).map((x) => (x.id === b.id ? b : x)))}
      onAddBaby={() => setAdding(true)}
      onSignOut={onSignOut}
    />
  );
}

export function Splash() {
  return (
    <main className="splash" aria-busy="true">
      <h1 className="logo">Dollo</h1>
    </main>
  );
}
