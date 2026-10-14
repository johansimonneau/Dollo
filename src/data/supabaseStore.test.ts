import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { emptyEvent } from '../lib/types';
import { createSupabaseStore } from './supabaseStore';

/** Faux client minimal : enregistre l'appel et renvoie la réponse programmée. */
function fakeClient(response: { data?: unknown; error?: { message: string } | null }, otpError: { message: string } | null = null) {
  const calls: { table?: string; op?: string; payload?: unknown; filters: [string, unknown][]; rpc?: [string, unknown]; otp?: unknown } = {
    filters: [],
  };
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
    auth: {
      signInWithOtp: (args: unknown) => {
        calls.otp = args;
        return Promise.resolve({ data: {}, error: otpError });
      },
    },
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
      createdBy: null,
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

  it('lit les bébés avec le rôle via list_my_babies (nounou : ni date ni code)', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'b1', name: 'Léa', birth_date: null, invite_code: null, created_at: '2026-10-01T00:00:00Z', role: 'nanny' }] });
    const [b] = await createSupabaseStore(client).listBabies();
    expect(calls.rpc).toEqual(['list_my_babies', undefined]);
    expect(b).toEqual({ id: 'b1', name: 'Léa', birthDate: null, inviteCode: undefined, createdAt: '2026-10-01T00:00:00Z', role: 'nanny', sex: null });
  });

  describe('croissance', () => {
    it('convertit une mesure (grammes, millimètres) et n\'envoie que les champs fournis', async () => {
      const row = { id: 'm1', baby_id: 'b1', measured_on: '2026-10-01', weight_g: 4250, length_mm: 545, head_mm: null, note: null };
      const read = fakeClient({ data: [row] });
      expect(await createSupabaseStore(read.client).listMeasurements('b1')).toEqual([
        { id: 'm1', babyId: 'b1', measuredOn: '2026-10-01', weightG: 4250, lengthMm: 545, headMm: null, note: null },
      ]);
      const upd = fakeClient({ data: row });
      await createSupabaseStore(upd.client).updateMeasurement('m1', { weightG: 4300 });
      expect(upd.calls.payload).toEqual({ weight_g: 4300 });
    });

    it("le sexe n'est envoyé que s'il est fourni (base sans migration 0007 : le reste du profil s'enregistre)", async () => {
      const a = fakeClient({ data: { id: 'b1', name: 'Léa', birth_date: null, invite_code: 'X', created_at: '' } });
      await createSupabaseStore(a.client).updateBaby('b1', { name: 'Léa', birthDate: null });
      expect(a.calls.payload).toEqual({ name: 'Léa', birth_date: null });
      const b = fakeClient({ data: { id: 'b1', name: 'Léa', birth_date: null, invite_code: 'X', created_at: '', sex: 'f' } });
      await createSupabaseStore(b.client).updateBaby('b1', { name: 'Léa', birthDate: null, sex: 'f' });
      expect(b.calls.payload).toEqual({ name: 'Léa', birth_date: null, sex: 'f' });
    });

    it('colonne ou table absente (migration non appliquée) : message clair', async () => {
      const { client } = fakeClient({ error: { message: "Could not find the table 'public.measurements' in the schema cache" } });
      await expect(createSupabaseStore(client).listMeasurements('b1')).rejects.toThrow('appliquez les migrations Supabase');
    });
  });

  describe('membres', () => {
    it('liste les membres avec leur e-mail et leur rôle', async () => {
      const { client, calls } = fakeClient({ data: [{ user_id: 'u1', email: 'maman@example.com', role: 'owner', joined_at: '2026-10-13T10:00:00Z' }] });
      const list = await createSupabaseStore(client).listMembers('b1');
      expect(calls.rpc).toEqual(['list_members', { p_baby_id: 'b1' }]);
      expect(list).toEqual([{ userId: 'u1', email: 'maman@example.com', role: 'owner', joinedAt: '2026-10-13T10:00:00Z' }]);
    });

    it('retire un parent, et traduit les refus', async () => {
      const ok = fakeClient({ data: null });
      await createSupabaseStore(ok.client).removeMember('b1', 'u2');
      expect(ok.calls.rpc).toEqual(['remove_member', { p_baby_id: 'b1', p_user_id: 'u2' }]);
      const refused = fakeClient({ error: { message: 'forbidden' } });
      await expect(createSupabaseStore(refused.client).removeMember('b1', 'u2')).rejects.toThrow("Vous n'avez pas le droit de faire cela.");
      const missing = fakeClient({ error: { message: 'Could not find the function public.remove_member(p_baby_id, p_user_id) in the schema cache' } });
      await expect(createSupabaseStore(missing.client).removeMember('b1', 'u2')).rejects.toThrow('appliquez les migrations Supabase');
    });
  });

  describe('invitations par e-mail', () => {
    const invRow = {
      id: 'i1',
      baby_id: 'b1',
      email: 'papa@example.com',
      created_at: '2026-10-13T10:00:00Z',
      expires_at: '2026-10-27T10:00:00Z',
      accepted_at: null,
    };

    it("enregistre l'invitation sans envoyer d'e-mail de connexion (l'invité crée son compte avec mot de passe)", async () => {
      const { client, calls } = fakeClient({ data: invRow });
      const inv = await createSupabaseStore(client).inviteParent('b1', ' Papa@Example.com ');
      expect(calls.rpc).toEqual(['invite_parent', { p_baby_id: 'b1', p_email: ' Papa@Example.com ' }]);
      expect(calls.otp).toBeUndefined();
      expect(inv).toEqual({ id: 'i1', babyId: 'b1', email: 'papa@example.com', createdAt: '2026-10-13T10:00:00Z', expiresAt: '2026-10-27T10:00:00Z', acceptedAt: null, role: 'parent' });
    });

    it("transmet le rôle nounou (et seulement dans ce cas, pour rester compatible avec une base non migrée)", async () => {
      const { client, calls } = fakeClient({ data: { ...invRow, role: 'nanny' } });
      const inv = await createSupabaseStore(client).inviteParent('b1', 'nounou@example.com', 'nanny');
      expect(calls.rpc).toEqual(['invite_parent', { p_baby_id: 'b1', p_email: 'nounou@example.com', p_role: 'nanny' }]);
      expect(inv.role).toBe('nanny');
    });

    it('traduit le refus de la base', async () => {
      const { client } = fakeClient({ error: { message: 'already_member' } });
      await expect(createSupabaseStore(client).inviteParent('b1', 'maman@example.com')).rejects.toThrow('Cette personne a déjà accès à ce bébé.');
    });

    it.each([
      ['invalid_email', 'Adresse e-mail invalide.'],
      ['too_many_invitations', "Trop d'invitations en attente (5 maximum). Annulez-en une d'abord."],
      ['forbidden', "Vous n'avez pas le droit de faire cela."],
    ])('traduit l\'erreur « %s »', async (code, message) => {
      const { client } = fakeClient({ error: { message: code } });
      await expect(createSupabaseStore(client).inviteParent('b1', 'x@example.com')).rejects.toThrow(message);
    });

    it("explique quoi faire quand la migration n'a pas été appliquée", async () => {
      const { client } = fakeClient({ error: { message: 'Could not find the function public.invite_parent(p_baby_id, p_email) in the schema cache' } });
      await expect(createSupabaseStore(client).inviteParent('b1', 'x@example.com')).rejects.toThrow('appliquez les migrations Supabase');
    });

    it('liste les invitations du bébé, les plus récentes en premier', async () => {
      const { client, calls } = fakeClient({ data: [invRow] });
      const list = await createSupabaseStore(client).listInvitations('b1');
      expect(calls.table).toBe('baby_invitations');
      expect(calls.filters).toEqual([['baby_id', 'b1']]);
      expect(list[0]).toMatchObject({ email: 'papa@example.com', acceptedAt: null });
    });

    it('annule une invitation', async () => {
      const { client, calls } = fakeClient({});
      await createSupabaseStore(client).cancelInvitation('i1');
      expect(calls.op).toBe('delete');
      expect(calls.filters).toEqual([['id', 'i1']]);
    });

    it('accepte les invitations et renvoie les bébés rejoints', async () => {
      const { client, calls } = fakeClient({
        data: [{ id: 'b1', name: 'Léa', birth_date: null, invite_code: 'ABCDE12345', created_at: '2026-10-01T00:00:00Z' }],
      });
      const joined = await createSupabaseStore(client).acceptInvitations();
      expect(calls.rpc?.[0]).toBe('accept_invitations');
      expect(joined).toHaveLength(1);
      expect(joined[0]).toMatchObject({ id: 'b1', name: 'Léa' });
    });

    it("renvoie une liste vide quand il n'y a rien à accepter", async () => {
      const { client } = fakeClient({ data: [] });
      expect(await createSupabaseStore(client).acceptInvitations()).toEqual([]);
    });
  });
});
