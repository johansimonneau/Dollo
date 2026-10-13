import type { Baby, BabyEvent, NewEvent } from '../lib/types';
import { StoreError, type BabyInput, type Store } from './store';

const KEY = 'dollo:v1';

interface Data {
  babies: Baby[];
  events: BabyEvent[];
}

function read(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Data>;
      return { babies: parsed.babies ?? [], events: parsed.events ?? [] };
    }
  } catch {
    /* stockage indisponible ou corrompu : on repart d'une base vide */
  }
  return { babies: [], events: [] };
}

function write(data: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    throw new StoreError("Impossible d'enregistrer sur cet appareil (stockage plein ou désactivé).");
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function createLocalStore(): Store {
  return {
    mode: 'local',

    async listBabies() {
      return read().babies;
    },

    async createBaby(input: BabyInput) {
      const data = read();
      const baby: Baby = { id: crypto.randomUUID(), name: input.name, birthDate: input.birthDate, createdAt: new Date().toISOString() };
      write({ ...data, babies: [...data.babies, baby] });
      return baby;
    },

    async updateBaby(id, input) {
      const data = read();
      const baby = data.babies.find((b) => b.id === id);
      if (!baby) throw new StoreError('Bébé introuvable.');
      const updated = { ...baby, name: input.name, birthDate: input.birthDate };
      write({ ...data, babies: data.babies.map((b) => (b.id === id ? updated : b)) });
      return updated;
    },

    async joinBaby() {
      throw new StoreError('Le partage entre parents nécessite la synchronisation en ligne (Supabase).');
    },

    async regenerateInviteCode() {
      throw new StoreError('Le partage entre parents nécessite la synchronisation en ligne (Supabase).');
    },

    async listInvitations() {
      return [];
    },

    async inviteParent() {
      throw new StoreError("L'invitation par e-mail nécessite la synchronisation en ligne (Supabase).");
    },

    async cancelInvitation() {
      /* aucune invitation en mode local */
    },

    async acceptInvitations() {
      return [];
    },

    async listEvents(babyId, sinceIso) {
      const since = new Date(sinceIso).getTime();
      return read().events.filter((e) => e.babyId === babyId && new Date(e.startedAt).getTime() >= since);
    },

    async addEvent(event: NewEvent) {
      const data = read();
      const created: BabyEvent = { ...event, id: crypto.randomUUID() };
      write({ ...data, events: [...data.events, created] });
      notify();
      return created;
    },

    async updateEvent(id, patch) {
      const data = read();
      const current = data.events.find((e) => e.id === id);
      if (!current) throw new StoreError('Événement introuvable.');
      const updated: BabyEvent = { ...current, ...patch, id };
      write({ ...data, events: data.events.map((e) => (e.id === id ? updated : e)) });
      notify();
      return updated;
    },

    async deleteEvent(id) {
      const data = read();
      write({ ...data, events: data.events.filter((e) => e.id !== id) });
      notify();
    },

    subscribe(_babyId, onChange) {
      listeners.add(onChange);
      // Autre onglet de la même app ouvert sur le même appareil.
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) onChange();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
