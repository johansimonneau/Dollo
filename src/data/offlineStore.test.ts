import { beforeEach, describe, expect, it } from 'vitest';
import { emptyEvent, type BabyEvent, type NewEvent } from '../lib/types';
import { createOfflineStore } from './offlineStore';
import { NetworkError, StoreError, type Store } from './store';

// localStorage minimal (les tests tournent sous Node).
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

/** Faux serveur : `down` coupe le réseau ; `loseResponse` enregistre mais « perd » la réponse. */
function fakeServer() {
  const rows = new Map<string, BabyEvent>();
  const calls: string[] = [];
  const s = { down: false, loseResponse: false, refuse: false };
  const net = () => {
    if (s.down) throw new NetworkError();
  };
  const inner = {
    mode: 'cloud',
    async listEvents(babyId: string) {
      net();
      return [...rows.values()].filter((e) => e.babyId === babyId);
    },
    async addEvent(event: NewEvent, id?: string) {
      net();
      calls.push(`add:${id}`);
      if (s.refuse) throw new StoreError('refusé');
      if (rows.has(id!)) return rows.get(id!)!; // le vrai serveur renvoie l'existant (code 23505)
      const created = { ...event, id: id! };
      rows.set(created.id, created);
      if (s.loseResponse) throw new NetworkError();
      return created;
    },
    async updateEvent(id: string, patch: Partial<NewEvent>) {
      net();
      calls.push(`update:${id}`);
      const cur = { ...rows.get(id)!, ...patch };
      rows.set(id, cur);
      return cur;
    },
    async deleteEvent(id: string) {
      net();
      calls.push(`delete:${id}`);
      rows.delete(id);
    },
    subscribe: () => () => undefined,
  } as unknown as Store;
  return { inner, rows, calls, s };
}

const bottle = (ml = 90): NewEvent => ({ ...emptyEvent('b1', 'bottle', new Date().toISOString()), amountMl: ml });
let user = 'alice';

describe('hors ligne', () => {
  beforeEach(() => {
    mem.clear();
    user = 'alice';
  });

  it('en ligne : écriture directe, rien en attente', async () => {
    const f = fakeServer();
    const st = createOfflineStore(f.inner, () => user);
    await st.addEvent(bottle());
    expect(f.rows.size).toBe(1);
    expect(st.syncState()).toEqual({ pending: 0, offline: false });
  });

  it("sans réseau : la saisie s'affiche tout de suite, est gardée, puis envoyée UNE fois au retour du réseau", async () => {
    const f = fakeServer();
    const st = createOfflineStore(f.inner, () => user);
    await st.listEvents('b1', '');
    f.s.down = true;
    const created = await st.addEvent(bottle(90));
    await st.updateEvent(created.id, { amountMl: 120 }); // corrigée hors ligne
    expect(st.syncState()).toEqual({ pending: 1, offline: true });
    const view = await st.listEvents('b1', '');
    expect(view.map((e) => [e.id, e.amountMl])).toEqual([[created.id, 120]]);

    f.s.down = false;
    await st.flush();
    expect(f.calls).toEqual([`add:${created.id}`]); // un seul envoi, déjà corrigé
    expect(f.rows.get(created.id)?.amountMl).toBe(120);
    expect(st.syncState()).toEqual({ pending: 0, offline: false });
  });

  it("réseau coupé pendant la réponse : rejouer n'entraîne pas de doublon", async () => {
    const f = fakeServer();
    const st = createOfflineStore(f.inner, () => user);
    f.s.loseResponse = true;
    const created = await st.addEvent(bottle());
    f.s.loseResponse = false;
    await st.flush();
    expect(f.rows.size).toBe(1);
    expect([...f.rows.keys()]).toEqual([created.id]);
  });

  it('les données déjà vues restent affichées sans réseau', async () => {
    const f = fakeServer();
    const st = createOfflineStore(f.inner, () => user);
    await st.addEvent(bottle());
    await st.listEvents('b1', '');
    f.s.down = true;
    expect(await st.listEvents('b1', '')).toHaveLength(1);
  });

  it("une saisie refusée par le serveur n'est pas rejouée indéfiniment, et c'est signalé", async () => {
    const f = fakeServer();
    let dropped = 0;
    const st = createOfflineStore(f.inner, () => user, (n) => (dropped += n));
    f.s.down = true;
    await st.addEvent(bottle());
    f.s.down = false;
    f.s.refuse = true;
    await st.flush();
    expect(st.syncState().pending).toBe(0);
    expect(dropped).toBe(1);
  });

  it("la file est propre au compte : un autre compte sur le téléphone n'envoie pas ces saisies", async () => {
    const f = fakeServer();
    const st = createOfflineStore(f.inner, () => user);
    f.s.down = true;
    await st.addEvent(bottle());
    user = 'bob';
    f.s.down = false;
    await st.flush();
    expect(f.rows.size).toBe(0);
    user = 'alice';
    await st.flush();
    expect(f.rows.size).toBe(1);
  });
});
