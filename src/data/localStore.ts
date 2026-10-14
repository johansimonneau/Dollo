import { DEFAULT_PREFS, type ReminderPrefs } from '../../supabase/functions/_shared/reminders';
import type { Baby, BabyEvent, Measurement, NewEvent } from '../lib/types';
import { StoreError, type BabyInput, type Store } from './store';

const KEY = 'dollo:v1';
/** Réglages de rappels en mode local (bandeaux dans l'app uniquement). */
const PREFS_KEY = 'dollo:reminders';

interface Data {
  babies: Baby[];
  events: BabyEvent[];
  measurements: Measurement[];
}

function read(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Data>;
      return { babies: parsed.babies ?? [], events: parsed.events ?? [], measurements: parsed.measurements ?? [] };
    }
  } catch {
    /* stockage indisponible ou corrompu : on repart d'une base vide */
  }
  return { babies: [], events: [], measurements: [] };
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
      const updated = { ...baby, name: input.name, birthDate: input.birthDate, ...(input.sex !== undefined ? { sex: input.sex } : {}) };
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

    async listMembers() {
      return [];
    },

    async removeMember() {
      throw new StoreError('Le partage entre parents nécessite la synchronisation en ligne (Supabase).');
    },

    async listMeasurements(babyId) {
      return read()
        .measurements.filter((m) => m.babyId === babyId)
        .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    },

    async addMeasurement(m) {
      const data = read();
      const created: Measurement = { ...m, id: crypto.randomUUID() };
      write({ ...data, measurements: [...data.measurements, created] });
      return created;
    },

    async updateMeasurement(id, patch) {
      const data = read();
      const cur = data.measurements.find((m) => m.id === id);
      if (!cur) throw new StoreError('Mesure introuvable.');
      const updated = { ...cur, ...patch, id };
      write({ ...data, measurements: data.measurements.map((m) => (m.id === id ? updated : m)) });
      return updated;
    },

    async deleteMeasurement(id) {
      const data = read();
      write({ ...data, measurements: data.measurements.filter((m) => m.id !== id) });
    },

    async getReminderPrefs(babyId) {
      try {
        const raw = localStorage.getItem(`${PREFS_KEY}:${babyId}`);
        return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ReminderPrefs>) } : { ...DEFAULT_PREFS };
      } catch {
        return { ...DEFAULT_PREFS };
      }
    },

    async saveReminderPrefs(babyId, prefs) {
      localStorage.setItem(`${PREFS_KEY}:${babyId}`, JSON.stringify(prefs));
    },

    async savePushSubscription() {
      throw new StoreError('Les notifications nécessitent la synchronisation en ligne (Supabase).');
    },

    async deletePushSubscription() {
      /* aucune notification en mode local */
    },

    async acceptInvitations() {
      return [];
    },

    async listEvents(babyId, sinceIso) {
      const since = new Date(sinceIso).getTime();
      return read().events.filter((e) => e.babyId === babyId && new Date(e.startedAt).getTime() >= since);
    },

    async addEvent(event: NewEvent, id?: string) {
      const data = read();
      const created: BabyEvent = { ...event, id: id ?? crypto.randomUUID() };
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
