// Test de bout en bout de l'envoi, sans Supabase ni vrai service de notification :
// un faux PostgREST et un faux service push (HTTPS) tournent en local.
// Lancer (certificat auto-signé pour localhost, ajouté aux autorités de confiance) :
//   TEST_CERT=cert.pem TEST_KEY=key.pem NODE_EXTRA_CA_CERTS=cert.pem deno test -A --cert cert.pem --config deno.json
import webpush from 'npm:web-push@3.6.7';

const H = 3_600_000;
const iso = (agoH: number) => new Date(Date.now() - agoH * H).toISOString();
const alice = 'a0000000-0000-0000-0000-00000000000a';
const baby = 'b0000000-0000-0000-0000-00000000000b';

function fakeWorld() {
  const sent = new Set<string>();
  const devices = [
    { id: 'd1', endpoint: '', p256dh: '', auth: '' },
    { id: 'd2', endpoint: '', p256dh: '', auth: '' }, // désinstallé : le service push répond 410
  ];
  const pushed: string[] = [];
  const deleted: string[] = [];
  const settings = [{ user_id: alice, baby_id: baby, feed_every_min: 180, diaper_dry_hours: 6, quiet_night: false, time_zone: 'Europe/Paris', babies: { name: 'Léa' } }];
  const events = [
    { id: 'e-feed', kind: 'bottle', started_at: iso(3.5), ended_at: null, diaper_type: null }, // repas dû
    { id: 'e-pee', kind: 'diaper', started_at: iso(2), ended_at: null, diaper_type: 'pee' }, // couche : pas due
  ];
  // Le service push est en HTTPS (comme les vrais) : certificat de test fourni par TEST_CERT / TEST_KEY.
  const push = Deno.serve(
    { port: 0, onListen: () => {}, cert: Deno.readTextFileSync(Deno.env.get('TEST_CERT')!), key: Deno.readTextFileSync(Deno.env.get('TEST_KEY')!) },
    (req) => {
      const path = new URL(req.url).pathname;
      pushed.push(path);
      return new Response(null, { status: path.endsWith('/gone') ? 410 : 201 });
    },
  );
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    const json = (b: unknown, status = 200) => Response.json(b, { status });
    switch (url.pathname) {
      case '/rest/v1/reminder_settings':
        return json(settings);
      case '/rest/v1/events':
        return json(events);
      case '/rest/v1/push_subscriptions':
        if (req.method === 'DELETE') {
          deleted.push(url.searchParams.get('id')!.replace('eq.', ''));
          return new Response(null, { status: 204 });
        }
        return json(devices);
      case '/rest/v1/reminder_sent': {
        const row = await req.json();
        const key = `${row.user_id}:${row.baby_id}:${row.kind}:${row.ref_id}`;
        if (sent.has(key)) return json({ code: '23505', message: 'duplicate key' }, 409);
        sent.add(key);
        return new Response(null, { status: 201 });
      }
    }
    return json({ message: 'not found ' + url.pathname }, 404);
  });
  const base = `http://localhost:${server.addr.port}`;
  const pushBase = `https://localhost:${push.addr.port}`;
  return { server, push, base, pushBase, devices, pushed, deleted, sent };
}

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

Deno.test("envoie le rappel repas dû, une seule fois, et oublie l'appareil désinstallé", async () => {
  const w = fakeWorld();
  // clés de chiffrement d'un navigateur abonné (générées comme le ferait le téléphone)
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ecdh = { p256dh: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
  w.devices[0] = { ...w.devices[0], endpoint: `${w.pushBase}/push/ok`, ...ecdh };
  w.devices[1] = { ...w.devices[1], endpoint: `${w.pushBase}/push/gone`, ...ecdh };
  const keys = webpush.generateVAPIDKeys();
  Deno.env.set('SUPABASE_URL', w.base);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
  Deno.env.set('VAPID_PUBLIC_KEY', keys.publicKey);
  Deno.env.set('VAPID_PRIVATE_KEY', keys.privateKey);
  const { handle } = await import('./handler.ts');
  try {
    const first = await (await handle()).json();
    if (first.due !== 1) throw new Error(`1 rappel dû attendu (repas), reçu ${JSON.stringify(first)}`);
    if (w.pushed.length !== 2) throw new Error(`envoi aux 2 appareils attendu, reçu ${w.pushed.length}`);
    if (first.sent !== 1 || first.expiredDevices !== 1 || w.deleted[0] !== 'd2') throw new Error(`appareil 410 non nettoyé : ${JSON.stringify(first)}`);
    if (![...w.sent].some((k) => k.endsWith(':feed:e-feed'))) throw new Error('rappel non journalisé');

    const second = await (await handle()).json();
    if (second.sent !== 0 || w.pushed.length !== 2) throw new Error(`doublon envoyé au 2e passage : ${JSON.stringify(second)}`);
  } finally {
    await w.server.shutdown();
    await w.push.shutdown();
  }
});

Deno.test('sans clés VAPID : erreur explicite, aucun envoi', async () => {
  Deno.env.delete('VAPID_PRIVATE_KEY');
  const { handle } = await import('./handler.ts');
  const res = await handle();
  if (res.status !== 500 || !(await res.text()).includes('VAPID')) throw new Error('message attendu sur les clés VAPID');
});
