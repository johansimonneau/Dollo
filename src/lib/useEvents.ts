import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, type Store } from '../data/store';
import type { BabyEvent, NewEvent } from './types';
import { DAY } from './time';

/** Historique chargé en mémoire : assez pour le journal, les stats et l'export. */
export const HISTORY_DAYS = 45;

const byStartDesc = (a: BabyEvent, b: BabyEvent) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();

export function useEvents(store: Store, babyId: string) {
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Numéro de requête : une réponse périmée (autre bébé, ou écrasée par une écriture plus récente) est ignorée.
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const since = new Date(Date.now() - HISTORY_DAYS * DAY).toISOString();
      const list = await store.listEvents(babyId, since);
      if (id !== requestId.current) return;
      setEvents([...list].sort(byStartDesc));
      setError(null);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [store, babyId]);

  useEffect(() => {
    setLoading(true);
    setEvents([]);
    void reload();
  }, [reload]);

  // Mises à jour de l'autre parent + retour au premier plan (téléphone sorti de la poche à 3 h du matin).
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 250);
    };
    const unsubscribe = store.subscribe(babyId, schedule);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store, babyId, reload]);

  const settle = () => {
    requestId.current += 1; // invalide un rechargement en vol qui écraserait cette écriture
    setLoading(false);
  };

  const add = useCallback(
    async (event: NewEvent) => {
      const created = await store.addEvent(event);
      settle();
      setEvents((prev) => [created, ...prev.filter((e) => e.id !== created.id)].sort(byStartDesc));
      return created;
    },
    [store],
  );

  const update = useCallback(
    async (id: string, patch: Partial<NewEvent>) => {
      const updated = await store.updateEvent(id, patch);
      settle();
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)).sort(byStartDesc));
      return updated;
    },
    [store],
  );

  const remove = useCallback(
    async (id: string) => {
      await store.deleteEvent(id);
      settle();
      setEvents((prev) => prev.filter((e) => e.id !== id));
    },
    [store],
  );

  return { events, loading, error, reload, add, update, remove };
}
