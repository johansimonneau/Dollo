import type { SupabaseClient } from '@supabase/supabase-js';
import type { Baby, BabyEvent, BreastSide, DiaperType, EventKind, NewEvent } from '../lib/types';
import { StoreError, type BabyInput, type Store } from './store';

interface BabyRow {
  id: string;
  name: string;
  birth_date: string | null;
  invite_code: string;
  created_at: string;
}

interface EventRow {
  id: string;
  baby_id: string;
  kind: EventKind;
  started_at: string;
  ended_at: string | null;
  side: BreastSide | null;
  amount_ml: number | null;
  diaper_type: DiaperType | null;
  note: string | null;
}

const toBaby = (r: BabyRow): Baby => ({
  id: r.id,
  name: r.name,
  birthDate: r.birth_date,
  inviteCode: r.invite_code,
  createdAt: r.created_at,
});

const toEvent = (r: EventRow): BabyEvent => ({
  id: r.id,
  babyId: r.baby_id,
  kind: r.kind,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  side: r.side,
  amountMl: r.amount_ml,
  diaperType: r.diaper_type,
  note: r.note,
});

/** Ne transmet que les champs présents dans le patch (un `null` explicite efface la valeur). */
function toRow(e: Partial<NewEvent>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if ('babyId' in e) r.baby_id = e.babyId;
  if ('kind' in e) r.kind = e.kind;
  if ('startedAt' in e) r.started_at = e.startedAt;
  if ('endedAt' in e) r.ended_at = e.endedAt;
  if ('side' in e) r.side = e.side;
  if ('amountMl' in e) r.amount_ml = e.amountMl;
  if ('diaperType' in e) r.diaper_type = e.diaperType;
  if ('note' in e) r.note = e.note;
  return r;
}

function fail(error: { message: string; code?: string }, fallback: string): never {
  if (error.message.includes('invalid_code')) throw new StoreError("Ce code d'invitation n'existe pas.");
  throw new StoreError(error.message || fallback);
}

export function createSupabaseStore(client: SupabaseClient): Store {
  return {
    mode: 'cloud',

    async listBabies() {
      const { data, error } = await client.from('babies').select('*').order('created_at');
      if (error) fail(error, 'Chargement impossible.');
      return (data as BabyRow[]).map(toBaby);
    },

    async createBaby(input: BabyInput) {
      const { data, error } = await client
        .from('babies')
        .insert({ name: input.name, birth_date: input.birthDate })
        .select()
        .single();
      if (error) fail(error, 'Création impossible.');
      return toBaby(data as BabyRow);
    },

    async updateBaby(id, input) {
      const { data, error } = await client
        .from('babies')
        .update({ name: input.name, birth_date: input.birthDate })
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Modification impossible.');
      return toBaby(data as BabyRow);
    },

    async joinBaby(code) {
      const { data, error } = await client.rpc('join_baby', { p_code: code });
      if (error) fail(error, 'Impossible de rejoindre.');
      return toBaby(data as BabyRow);
    },

    async regenerateInviteCode(babyId) {
      const { data, error } = await client.rpc('regenerate_invite_code', { p_baby_id: babyId });
      if (error) fail(error, 'Impossible de renouveler le code.');
      return data as string;
    },

    async listEvents(babyId, sinceIso) {
      const { data, error } = await client
        .from('events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('started_at', sinceIso)
        .order('started_at', { ascending: false })
        .limit(3000);
      if (error) fail(error, 'Chargement impossible.');
      return (data as EventRow[]).map(toEvent);
    },

    async addEvent(event) {
      const { data, error } = await client.from('events').insert(toRow(event)).select().single();
      if (error) fail(error, 'Enregistrement impossible.');
      return toEvent(data as EventRow);
    },

    async updateEvent(id, patch) {
      const { data, error } = await client.from('events').update(toRow(patch)).eq('id', id).select().single();
      if (error) fail(error, 'Modification impossible.');
      return toEvent(data as EventRow);
    },

    async deleteEvent(id) {
      const { error } = await client.from('events').delete().eq('id', id);
      if (error) fail(error, 'Suppression impossible.');
    },

    subscribe(babyId, onChange) {
      // Pas de filtre `baby_id` : les DELETE ne portent que la clé primaire et ne passeraient pas le filtre.
      // La RLS restreint de toute façon ce que Realtime nous envoie ; on recharge simplement la liste.
      const channel = client
        .channel(`events:${babyId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
