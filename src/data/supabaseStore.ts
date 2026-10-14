import type { SupabaseClient } from '@supabase/supabase-js';
import type { Baby, BabyEvent, DiaperType, EventKind, Invitation, InviteRole, Measurement, Member, MilkBag, NewEvent, NewMeasurement, PumpSide, Role } from '../lib/types';
import { DEFAULT_PREFS } from '../../supabase/functions/_shared/reminders';
import { isNetworkFailure, NetworkError, StoreError, type BabyInput, type Store } from './store';

interface BabyRow {
  id: string;
  name: string;
  birth_date?: string | null;
  invite_code?: string | null;
  created_at?: string;
  /** Renvoyé par list_my_babies() (migration 0005). */
  role?: Role;
  sex?: 'f' | 'm' | null;
}

interface MeasurementRow {
  id: string;
  baby_id: string;
  measured_on: string;
  weight_g: number | null;
  length_mm: number | null;
  head_mm: number | null;
  note: string | null;
}

interface MilkRow {
  id: string;
  baby_id: string;
  pumped_at: string;
  volume_ml: number;
  storage: MilkBag['storage'];
  stored_at: string;
  used_at: string | null;
  discarded_at: string | null;
  note: string | null;
}

const toMilkBag = (r: MilkRow): MilkBag => ({
  id: r.id,
  babyId: r.baby_id,
  pumpedAt: r.pumped_at,
  volumeMl: r.volume_ml,
  storage: r.storage,
  storedAt: r.stored_at,
  usedAt: r.used_at,
  discardedAt: r.discarded_at,
  note: r.note,
});

const toMeasurement = (r: MeasurementRow): Measurement => ({
  id: r.id,
  babyId: r.baby_id,
  measuredOn: r.measured_on,
  weightG: r.weight_g,
  lengthMm: r.length_mm,
  headMm: r.head_mm,
  note: r.note,
});

function measurementRow(m: Partial<NewMeasurement>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if ('babyId' in m) r.baby_id = m.babyId;
  if ('measuredOn' in m) r.measured_on = m.measuredOn;
  if ('weightG' in m) r.weight_g = m.weightG;
  if ('lengthMm' in m) r.length_mm = m.lengthMm;
  if ('headMm' in m) r.head_mm = m.headMm;
  if ('note' in m) r.note = m.note;
  return r;
}

interface InvitationRow {
  id: string;
  baby_id: string;
  email: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  role?: InviteRole;
}

interface EventRow {
  id: string;
  baby_id: string;
  kind: EventKind;
  started_at: string;
  ended_at: string | null;
  side: PumpSide | null;
  amount_ml: number | null;
  diaper_type: DiaperType | null;
  note: string | null;
  created_by?: string | null;
  temp_c?: number | string | null;
  med_name?: string | null;
  med_dose?: string | null;
}

const toBaby = (r: BabyRow): Baby => ({
  id: r.id,
  name: r.name,
  birthDate: r.birth_date ?? null,
  inviteCode: r.invite_code ?? undefined,
  createdAt: r.created_at ?? '',
  role: r.role,
  sex: r.sex ?? null,
});

const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  babyId: r.baby_id,
  email: r.email,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  acceptedAt: r.accepted_at,
  role: r.role ?? 'parent',
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
  createdBy: r.created_by ?? null,
  // numeric(3,1) arrive en texte selon les versions de PostgREST
  tempC: r.temp_c == null ? null : Number(r.temp_c),
  medName: r.med_name ?? null,
  medDose: r.med_dose ?? null,
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
  // Nouveaux champs (migration 0008) : envoyés seulement pour les événements qui les utilisent, pour qu'une base pas
  // encore migrée continue d'accepter tétées, biberons, couches et dodos.
  const concerns = (k: EventKind, v: unknown) => v != null || !('kind' in e) || e.kind === k;
  if ('tempC' in e && concerns('temp', e.tempC)) r.temp_c = e.tempC;
  if ('medName' in e && concerns('med', e.medName)) r.med_name = e.medName;
  if ('medDose' in e && concerns('med', e.medDose)) r.med_dose = e.medDose;
  return r;
}

/** Erreurs métier levées par la base (voir supabase/migrations) puis remontées telles quelles par PostgREST. */
const DB_MESSAGES: [string, string][] = [
  ['invalid_code', "Ce code d'invitation n'existe pas."],
  ['already_member', 'Cette personne a déjà accès à ce bébé.'],
  ['invalid_email', 'Adresse e-mail invalide.'],
  ['too_many_invitations', "Trop d'invitations en attente (5 maximum). Annulez-en une d'abord."],
  ['forbidden', "Vous n'avez pas le droit de faire cela."],
  ['invalid_role', "Rôle d'invitation inconnu."],
  ['not_a_member', "Cette personne n'a pas (ou plus) accès à ce bébé."],
  // Migration oubliée : PostgREST ne trouve pas la fonction, la table ou la colonne.
  ['in the schema cache', "La base n'est pas à jour : appliquez les migrations Supabase (voir le README)."],
  ['could not find the function', "La base n'est pas à jour : appliquez les migrations Supabase (voir le README)."],
];

function fail(error: { message: string; code?: string }, fallback: string): never {
  if (isNetworkFailure(error.message)) throw new NetworkError();
  const m = error.message.toLowerCase();
  const known = DB_MESSAGES.find(([needle]) => m.includes(needle));
  throw new StoreError(known ? known[1] : error.message || fallback);
}

export function createSupabaseStore(client: SupabaseClient): Store {
  // La base a-t-elle les colonnes du traitement quotidien (migration 0008) ? Appris à la lecture des réglages.
  let hasDailyMed = false;
  return {
    mode: 'cloud',

    async listBabies() {
      // Avec la migration 0005 : les bébés ET le rôle (une nounou ne reçoit ni date de naissance ni code).
      const mine = await client.rpc('list_my_babies');
      if (!mine.error) return ((mine.data ?? []) as BabyRow[]).map(toBaby);
      if (!mine.error.message.toLowerCase().includes('could not find the function')) fail(mine.error, 'Chargement impossible.');
      // Base pas encore migrée : lecture directe, accès complet.
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
        .update({ name: input.name, birth_date: input.birthDate, ...(input.sex !== undefined ? { sex: input.sex } : {}) })
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

    async listInvitations(babyId) {
      const { data, error } = await client
        .from('baby_invitations')
        .select('*')
        .eq('baby_id', babyId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) fail(error, 'Chargement des invitations impossible.');
      return (data as InvitationRow[]).map(toInvitation);
    },

    async inviteParent(babyId, email, role = 'parent') {
      // p_role n'est transmis que pour une nounou : une base sans la migration 0005 accepte toujours l'invitation parent.
      const args = role === 'parent' ? { p_baby_id: babyId, p_email: email } : { p_baby_id: babyId, p_email: email, p_role: role };
      const { data, error } = await client.rpc('invite_parent', args);
      if (error) fail(error, "Invitation impossible.");
      return toInvitation(data as InvitationRow);
    },

    async cancelInvitation(id) {
      const { error } = await client.from('baby_invitations').delete().eq('id', id);
      if (error) fail(error, "Annulation impossible.");
    },

    async listMembers(babyId) {
      const { data, error } = await client.rpc('list_members', { p_baby_id: babyId });
      if (error) fail(error, 'Chargement des membres impossible.');
      return ((data ?? []) as { user_id: string; email: string; role: Member['role']; joined_at: string }[]).map((r) => ({
        userId: r.user_id,
        email: r.email,
        role: r.role,
        joinedAt: r.joined_at,
      }));
    },

    async removeMember(babyId, userId) {
      const { error } = await client.rpc('remove_member', { p_baby_id: babyId, p_user_id: userId });
      if (error) fail(error, 'Impossible de retirer ce parent.');
    },

    async acceptInvitations() {
      const { data, error } = await client.rpc('accept_invitations');
      if (error) fail(error, "Impossible de rejoindre le bébé.");
      return ((data ?? []) as BabyRow[]).map(toBaby);
    },

    async getReminderPrefs(babyId) {
      const base = 'feed_every_min, diaper_dry_hours, quiet_night';
      let res = await client.from('reminder_settings').select(`${base}, daily_med_name, daily_med_hour`).eq('baby_id', babyId).maybeSingle();
      hasDailyMed = !res.error;
      // Base sans la migration 0008 : on relit sans le traitement quotidien plutôt que de tout perdre.
      if (res.error && /daily_med|schema cache|does not exist/i.test(res.error.message)) {
        res = await client.from('reminder_settings').select(base).eq('baby_id', babyId).maybeSingle();
      }
      if (res.error) fail(res.error, 'Chargement des rappels impossible.');
      const data = res.data as {
        feed_every_min: number | null;
        diaper_dry_hours: number | null;
        quiet_night: boolean;
        daily_med_name?: string | null;
        daily_med_hour?: number | null;
      } | null;
      if (!data) return { ...DEFAULT_PREFS };
      return {
        feedEveryMin: data.feed_every_min,
        diaperDryHours: data.diaper_dry_hours,
        quietNight: data.quiet_night,
        dailyMed: data.daily_med_name ? { name: data.daily_med_name, hour: data.daily_med_hour ?? 9 } : null,
      };
    },

    async saveReminderPrefs(babyId, prefs, timeZone) {
      // user_id explicite : nécessaire au « on conflict (user_id, baby_id) ». La RLS vérifie qu'il s'agit bien de soi.
      const { data: auth } = await client.auth.getSession();
      const { error } = await client.from('reminder_settings').upsert(
        {
          user_id: auth.session?.user.id,
          baby_id: babyId,
          feed_every_min: prefs.feedEveryMin,
          diaper_dry_hours: prefs.diaperDryHours,
          quiet_night: prefs.quietNight,
          time_zone: timeZone,
          ...(hasDailyMed || prefs.dailyMed
            ? { daily_med_name: prefs.dailyMed?.name ?? null, daily_med_hour: prefs.dailyMed?.hour ?? null }
            : {}),
        },
        { onConflict: 'user_id,baby_id' },
      );
      if (error) fail(error, 'Enregistrement des rappels impossible.');
    },

    async savePushSubscription(sub) {
      const { error } = await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: 'endpoint' });
      if (error) fail(error, "Impossible d'activer les notifications.");
    },

    async deletePushSubscription(endpoint) {
      const { error } = await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) fail(error, 'Impossible de désactiver les notifications.');
    },

    async listMeasurements(babyId) {
      const { data, error } = await client.from('measurements').select('*').eq('baby_id', babyId).order('measured_on');
      if (error) fail(error, 'Chargement des mesures impossible.');
      return (data as MeasurementRow[]).map(toMeasurement);
    },

    async addMeasurement(m) {
      const { data, error } = await client.from('measurements').insert(measurementRow(m)).select().single();
      if (error) fail(error, 'Enregistrement de la mesure impossible.');
      return toMeasurement(data as MeasurementRow);
    },

    async updateMeasurement(id, patch) {
      const { data, error } = await client.from('measurements').update(measurementRow(patch)).eq('id', id).select().single();
      if (error) fail(error, 'Modification de la mesure impossible.');
      return toMeasurement(data as MeasurementRow);
    },

    async deleteMeasurement(id) {
      const { error } = await client.from('measurements').delete().eq('id', id);
      if (error) fail(error, 'Suppression de la mesure impossible.');
    },

    async listVaccinations(babyId) {
      const { data, error } = await client.from('vaccinations').select('id, baby_id, code, given_on, note').eq('baby_id', babyId);
      if (error) fail(error, 'Chargement des vaccins impossible.');
      return (data as { id: string; baby_id: string; code: string; given_on: string; note: string | null }[]).map((r) => ({
        id: r.id,
        babyId: r.baby_id,
        code: r.code,
        givenOn: r.given_on,
        note: r.note,
      }));
    },

    async saveVaccination(babyId, code, givenOn, note) {
      const existing = await client.from('vaccinations').select('id').eq('baby_id', babyId).eq('code', code).maybeSingle();
      if (existing.error) fail(existing.error, 'Enregistrement du vaccin impossible.');
      const q = existing.data
        ? client.from('vaccinations').update({ given_on: givenOn, note }).eq('id', (existing.data as { id: string }).id)
        : client.from('vaccinations').insert({ baby_id: babyId, code, given_on: givenOn, note });
      const { data, error } = await q.select('id, baby_id, code, given_on, note').single();
      if (error) fail(error, 'Enregistrement du vaccin impossible.');
      const r = data as { id: string; baby_id: string; code: string; given_on: string; note: string | null };
      return { id: r.id, babyId: r.baby_id, code: r.code, givenOn: r.given_on, note: r.note };
    },

    async deleteVaccination(id) {
      const { error } = await client.from('vaccinations').delete().eq('id', id);
      if (error) fail(error, 'Suppression du vaccin impossible.');
    },

    async listMilkBags(babyId) {
      const { data, error } = await client
        .from('milk_bags')
        .select('*')
        .eq('baby_id', babyId)
        .is('used_at', null)
        .is('discarded_at', null);
      if (error) fail(error, 'Chargement du stock de lait impossible.');
      return (data as MilkRow[]).map(toMilkBag);
    },

    async addMilkBag(bag) {
      const { data, error } = await client
        .from('milk_bags')
        .insert({ baby_id: bag.babyId, pumped_at: bag.pumpedAt, volume_ml: bag.volumeMl, storage: bag.storage, stored_at: bag.storedAt, note: bag.note })
        .select()
        .single();
      if (error) fail(error, 'Ajout au stock impossible.');
      return toMilkBag(data as MilkRow);
    },

    async updateMilkBag(id, patch) {
      const row: Record<string, unknown> = {};
      if ('volumeMl' in patch) row.volume_ml = patch.volumeMl;
      if ('storage' in patch) row.storage = patch.storage;
      if ('storedAt' in patch) row.stored_at = patch.storedAt;
      if ('usedAt' in patch) row.used_at = patch.usedAt;
      if ('discardedAt' in patch) row.discarded_at = patch.discardedAt;
      if ('note' in patch) row.note = patch.note;
      const { data, error } = await client.from('milk_bags').update(row).eq('id', id).select().single();
      if (error) fail(error, 'Mise à jour du stock impossible.');
      return toMilkBag(data as MilkRow);
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

    async addEvent(event, id) {
      const { data, error } = await client
        .from('events')
        .insert({ ...toRow(event), ...(id ? { id } : {}) })
        .select()
        .single();
      if (error) {
        // Saisie hors ligne rejouée alors qu'elle était déjà arrivée (réponse perdue) : pas de doublon.
        if (id && error.code === '23505') {
          const existing = await client.from('events').select('*').eq('id', id).single();
          if (!existing.error) return toEvent(existing.data as EventRow);
        }
        fail(error, 'Enregistrement impossible.');
      }
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
