import { applyOps, compact, type Op } from '../lib/outbox';
import type { Baby, BabyEvent, NewEvent } from '../lib/types';
import { NetworkError, type Store } from './store';

export interface SyncState {
  /** Saisies faites sans réseau, pas encore envoyées. */
  pending: number;
  /** Dernière tentative d'accès au serveur échouée faute de réseau. */
  offline: boolean;
}

export interface OfflineStore extends Store {
  syncState(): SyncState;
  onSyncChange(cb: (s: SyncState) => void): () => void;
  /** Envoie la file d'attente (appelé automatiquement au retour du réseau). */
  flush(): Promise<void>;
}

const RETRY_MS = 20_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou indisponible : on garde au moins la session en mémoire */
  }
}

/**
 * Enveloppe le stockage en ligne pour fonctionner sans réseau (chambre de bébé sans signal, métro…) :
 * - les dernières données vues sont gardées sur le téléphone et affichées hors ligne ;
 * - une saisie sans réseau est enregistrée sur le téléphone, affichée tout de suite, puis envoyée dès que possible,
 *   dans l'ordre, sans doublon (identifiant choisi par l'appareil) ;
 * - une saisie refusée par le serveur (droits retirés, événement supprimé par l'autre parent) est abandonnée et signalée.
 * La file est propre à chaque compte (`userKey`) : un autre compte sur le même téléphone n'envoie jamais ces saisies.
 */
export function createOfflineStore(inner: Store, userKey: () => string | null, onDropped?: (count: number) => void): OfflineStore {
  const outboxKey = () => `dollo:outbox:${userKey() ?? 'anon'}`;
  const cacheKey = (name: string) => `dollo:cache:${userKey() ?? 'anon'}:${name}`;
  const ops = (): Op[] => load<Op[]>(outboxKey(), []);
  const setOps = (next: Op[]) => {
    save(outboxKey(), compact(next));
    emit();
  };

  let offline = false;
  const syncListeners = new Set<(s: SyncState) => void>();
  const changeListeners = new Set<() => void>();
  const state = (): SyncState => ({ pending: ops().length, offline });
  const emit = () => syncListeners.forEach((cb) => cb(state()));
  const setOffline = (v: boolean) => {
    if (offline !== v) {
      offline = v;
      emit();
    }
  };

  /** Appel réseau : marque l'état hors ligne / en ligne et laisse passer les autres erreurs. */
  async function online<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      setOffline(false);
      return r;
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
      throw e;
    }
  }

  // Derniers événements connus, pour répondre à une modification hors ligne avec l'événement complet.
  const known = new Map<string, BabyEvent>();

  let flushing: Promise<void> | null = null;
  async function flushNow() {
    let dropped = 0;
    for (;;) {
      const queue = ops();
      if (queue.length === 0) break;
      const op = queue[0];
      try {
        if (op.kind === 'add') await online(() => inner.addEvent(op.event, op.id));
        else if (op.kind === 'update') await online(() => inner.updateEvent(op.id, op.patch));
        else await online(() => inner.deleteEvent(op.id));
      } catch (e) {
        if (e instanceof NetworkError) break; // toujours pas de réseau : on réessaiera
        dropped++; // refus du serveur : rejouer ne servirait à rien
      }
      save(outboxKey(), ops().slice(1));
      emit();
    }
    if (dropped > 0) onDropped?.(dropped);
    changeListeners.forEach((cb) => cb());
  }
  // Un envoi demandé pendant un envoi en cours (ex. : le réseau vient de revenir) relance un tour juste après.
  let again = false;
  const flush = (): Promise<void> => {
    if (flushing) {
      again = true;
      return flushing;
    }
    flushing = (async () => {
      do {
        again = false;
        await flushNow();
      } while (again && ops().length > 0);
    })().finally(() => (flushing = null));
    return flushing;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && ops().length > 0 && void flush());
    window.setInterval(() => ops().length > 0 && void flush(), RETRY_MS);
  }

  /** Écriture d'événement : directe si possible, sinon mise en file. File non vide = on y ajoute (ordre garanti). */
  async function write(op: Op, direct: () => Promise<BabyEvent | void>, optimistic: () => BabyEvent | void) {
    if (ops().length === 0) {
      try {
        return await online(direct);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
      }
    }
    setOps([...ops(), op]);
    void flush();
    return optimistic();
  }

  return {
    ...inner,

    syncState: state,
    onSyncChange(cb) {
      syncListeners.add(cb);
      return () => syncListeners.delete(cb);
    },
    flush,

    async listBabies(): Promise<Baby[]> {
      try {
        const babies = await online(() => inner.listBabies());
        save(cacheKey('babies'), babies);
        return babies;
      } catch (e) {
        const cached = load<Baby[] | null>(cacheKey('babies'), null);
        if (e instanceof NetworkError && cached) return cached;
        throw e;
      }
    },

    async listEvents(babyId, sinceIso) {
      let base: BabyEvent[];
      try {
        base = await online(() => inner.listEvents(babyId, sinceIso));
        save(cacheKey(`events:${babyId}`), base);
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        base = load<BabyEvent[]>(cacheKey(`events:${babyId}`), []);
      }
      const view = applyOps(base, ops(), babyId);
      view.forEach((ev) => known.set(ev.id, ev));
      return view;
    },

    async addEvent(event: NewEvent) {
      const id = crypto.randomUUID();
      const created = (await write(
        { kind: 'add', id, event },
        () => inner.addEvent(event, id),
        () => ({ ...event, id }),
      )) as BabyEvent;
      known.set(created.id, created);
      return created;
    },

    async updateEvent(id, patch) {
      const before = known.get(id);
      const babyId = before?.babyId ?? patch.babyId ?? '';
      const updated = (await write(
        { kind: 'update', id, babyId, patch },
        () => inner.updateEvent(id, patch),
        () => ({ ...(before as BabyEvent), ...patch, id }),
      )) as BabyEvent;
      known.set(id, updated);
      return updated;
    },

    async deleteEvent(id) {
      const babyId = known.get(id)?.babyId ?? '';
      await write({ kind: 'delete', id, babyId }, () => inner.deleteEvent(id), () => undefined);
      known.delete(id);
    },

    subscribe(babyId, onChange) {
      const off = inner.subscribe(babyId, onChange);
      changeListeners.add(onChange);
      return () => {
        off();
        changeListeners.delete(onChange);
      };
    },
  };
}

