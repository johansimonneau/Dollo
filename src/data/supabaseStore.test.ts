import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { emptyEvent } from '../lib/types';
import { createSupabaseStore } from './supabaseStore';

/** Faux client minimal : enregistre l'appel et renvoie la réponse programmée. */
function fakeClient(response: { data?: unknown; error?: { message: string } | null }) {
  const calls: { table?: string; op?: string; payload?: unknown; filters: [string, unknown][]; rpc?: [string, unknown] } = { filters: [] };
  const result = { data: response.data ?? null, error: response.error ?? null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    single: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: (payload: unknown) => ((calls.op = 'insert'), (calls.payload = payload), chain),
    update: (payload: unknown) => ((calls.op = 'update'), (calls.payload = payload), chain),
    delete: () => ((calls.op = 'delete'), chain),
    eq: (col: string, v: unknown) => (calls.filters.push([col, v]), chain),
    gte: (col: string, v: unknown) => (calls.filters.push([col, v]), chain),
    then: (resolve: (r: typeof result) => unknown) => resolve(result),
  };
  const client = {
    from: (table: string) => ((calls.table = table), chain),
    rpc: (name: string, args: unknown) => ((calls.rpc = [name, args]), chain),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = {
  id: 'e1',
  baby_id: 'b1',
  kind: 'breast',
  started_at: '2026-10-13T07:00:00.000Z',
  ended_at: null,
  side: 'left',
  amount_ml: null,
  diaper_type: null,
  note: null,
};

describe('supabaseStore', () => {
  it("convertit une ligne SQL en événement de l'app", async () => {
    const { client } = fakeClient({ data: [row] });
    const [e] = await createSupabaseStore(client).listEvents('b1', '2026-09-01T00:00:00.000Z');
    expect(e).toEqual({
      id: 'e1',
      babyId: 'b1',
      kind: 'breast',
      startedAt: '2026-10-13T07:00:00.000Z',
      endedAt: null,
      side: 'left',
      amountMl: null,
      diaperType: null,
      note: null,
    });
  });

  it('filtre par bébé et par date de début', async () => {
    const { client, calls } = fakeClient({ data: [] });
    await createSupabaseStore(client).listEvents('b1', '2026-09-01T00:00:00.000Z');
    expect(calls.table).toBe('events');
    expect(calls.filters).toEqual([
      ['baby_id', 'b1'],
      ['started_at', '2026-09-01T00:00:00.000Z'],
    ]);
  });

  it("envoie les colonnes SQL à l'insertion, sans created_by (rempli par la base via auth.uid())", async () => {
    const { client, calls } = fakeClient({ data: row });
    await createSupabaseStore(client).addEvent({ ...emptyEvent('b1', 'breast', '2026-10-13T07:00:00.000Z'), side: 'left' });
    expect(calls.op).toBe('insert');
    expect(calls.payload).toEqual({
      baby_id: 'b1',
      kind: 'breast',
      started_at: '2026-10-13T07:00:00.000Z',
      ended_at: null,
      side: 'left',
      amount_ml: null,
      diaper_type: null,
      note: null,
    });
    expect(calls.payload).not.toHaveProperty('created_by');
  });

  it("ne transmet que les champs du patch, et un `null` explicite efface la valeur (annuler « Terminer »)", async () => {
    const { client, calls } = fakeClient({ data: row });
    await createSupabaseStore(client).updateEvent('e1', { endedAt: null });
    expect(calls.op).toBe('update');
    expect(calls.payload).toEqual({ ended_at: null });
    expect(calls.filters).toEqual([['id', 'e1']]);

    await createSupabaseStore(client).updateEvent('e1', { endedAt: '2026-10-13T07:20:00.000Z' });
    expect(calls.payload).toEqual({ ended_at: '2026-10-13T07:20:00.000Z' });
  });

  it('traduit le code d\'invitation invalide', async () => {
    const { client, calls } = fakeClient({ error: { message: 'invalid_code' } });
    await expect(createSupabaseStore(client).joinBaby('ZZZ')).rejects.toThrow("Ce code d'invitation n'existe pas.");
    expect(calls.rpc).toEqual(['join_baby', { p_code: 'ZZZ' }]);
  });

  it('remonte les erreurs de la base avec leur message', async () => {
    const { client } = fakeClient({ error: { message: 'JWT expired' } });
    await expect(createSupabaseStore(client).listBabies()).rejects.toThrow('JWT expired');
  });

  it('expose le code d\'invitation du bébé', async () => {
    const { client } = fakeClient({
      data: [{ id: 'b1', name: 'Léa', birth_date: '2026-09-20', invite_code: 'ABCDE12345', created_at: '2026-10-01T00:00:00Z' }],
    });
    const [b] = await createSupabaseStore(client).listBabies();
    expect(b).toMatchObject({ id: 'b1', name: 'Léa', birthDate: '2026-09-20', inviteCode: 'ABCDE12345' });
  });
});
