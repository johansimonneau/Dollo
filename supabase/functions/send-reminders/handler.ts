// Envoie les notifications de rappel (repas, couche) aux téléphones abonnés.
// Déclenchée toutes les 5 minutes par pg_cron (voir le README, section « Rappels »).
// Sans effet de bord si on l'appelle plus souvent : chaque rappel n'est envoyé qu'une fois (table reminder_sent).
// Logique ici ; index.ts ne fait que la servir (et handler.test.ts la teste sans vrai Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { dueDailyMed, dueReminders, localHour, reminderText, remindersToNotify, type ReminderEvent, type ReminderPrefs } from '../_shared/reminders.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

export async function handle(): Promise<Response> {
  const vapidPublic = env('VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  if (!vapidPublic || !vapidPrivate) {
    return Response.json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants (secrets de la fonction).' }, { status: 500 });
  }
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:contact@dollo.app', vapidPublic, vapidPrivate);

  // Service role : la fonction lit les réglages de tout le monde. Elle ne s'exécute que côté serveur.
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const now = Date.now();
  const stats = { checked: 0, due: 0, sent: 0, expiredDevices: 0, errors: 0 };

  const { data: settings, error } = await db
    .from('reminder_settings')
    .select('user_id, baby_id, feed_every_min, diaper_dry_hours, quiet_night, time_zone, daily_med_name, daily_med_hour, babies(name)')
    .or('feed_every_min.not.is.null,diaper_dry_hours.not.is.null,daily_med_name.not.is.null');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Notifications app fermée : réservées aux bébés Dollo+ (migration 0010). Base pas encore migrée : tout le monde.
  const premium = await db.rpc('premium_baby_ids');
  const premiumIds = premium.error ? null : new Set((premium.data as string[] | null) ?? []);
  if (premiumIds) settings.splice(0, settings.length, ...settings.filter((s) => premiumIds.has(s.baby_id as string)));

  // Événements des dernières 48 h, une requête par bébé.
  const eventsByBaby = new Map<string, ReminderEvent[]>();
  const since = new Date(now - 48 * 3_600_000).toISOString();
  for (const babyId of new Set(settings.map((s) => s.baby_id as string))) {
    const { data } = await db
      .from('events')
      .select('id, kind, started_at, ended_at, diaper_type, med_name')
      .eq('baby_id', babyId)
      .in('kind', ['breast', 'bottle', 'diaper', 'med'])
      .gte('started_at', since);
    eventsByBaby.set(
      babyId,
      (data ?? []).map((e) => ({ id: e.id, kind: e.kind, startedAt: e.started_at, endedAt: e.ended_at, diaperType: e.diaper_type, medName: e.med_name })),
    );
  }

  for (const s of settings) {
    stats.checked++;
    const prefs: ReminderPrefs = {
      feedEveryMin: s.feed_every_min,
      diaperDryHours: s.diaper_dry_hours,
      quietNight: s.quiet_night,
      dailyMed: s.daily_med_name ? { name: s.daily_med_name, hour: s.daily_med_hour } : null,
    };
    const events = eventsByBaby.get(s.baby_id) ?? [];
    const daily = dueDailyMed(events, prefs, now, s.time_zone);
    const due = remindersToNotify([...dueReminders(events, prefs, now), ...(daily ? [daily] : [])], prefs, now, localHour(now, s.time_zone));
    if (due.length === 0) continue;

    const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', s.user_id);
    let devices = data ?? [];
    if (!devices.length) continue;

    for (const r of due) {
      stats.due++;
      // Réserve le rappel AVANT l'envoi : deux exécutions simultanées n'enverront jamais de doublon.
      const { error: dup } = await db.from('reminder_sent').insert({ user_id: s.user_id, baby_id: s.baby_id, kind: r.kind, ref_id: r.refId });
      if (dup) continue; // déjà envoyé pour ce dernier repas / cette dernière couche

      const babyName = (s.babies as { name?: string } | null)?.name ?? 'Bébé';
      const payload = JSON.stringify({ ...reminderText(r, babyName, now, s.daily_med_name ?? undefined), tag: `${s.baby_id}:${r.kind}`, url: '/?app' });
      for (const d of [...devices]) {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600, urgency: 'high' });
          stats.sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Appareil désinstallé ou notifications révoquées : on oublie l'abonnement.
            await db.from('push_subscriptions').delete().eq('id', d.id);
            devices = devices.filter((x) => x.id !== d.id); // plus d'envoi vers cet appareil pour les rappels suivants
            stats.expiredDevices++;
          } else stats.errors++;
        }
      }
    }
  }
  return Response.json(stats);
}
