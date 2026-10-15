import type { PushSubscriptionData, Store } from '../data/store';
import { detectPlatform } from '../landing/install';

/**
 * État des notifications sur CET appareil.
 * - unconfigured : clé VAPID absente au build (rappels dans l'app uniquement) ;
 * - unsupported : navigateur sans Web Push ;
 * - needs-install : iPhone/iPad hors app installée (Apple n'autorise les notifications qu'aux apps de l'écran d'accueil) ;
 * - denied / default / granted : réponse de l'utilisateur à la demande d'autorisation.
 */
export type PushState = 'unconfigured' | 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted';

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushState(): PushState {
  if (!__VAPID_PUBLIC_KEY__) return 'unconfigured';
  const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios';
  if (ios && !standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function toSubscriptionData(sub: PushSubscription): PushSubscriptionData {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Abonnement aux notifications incomplet.');
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Demande l'autorisation (doit suivre un geste de l'utilisateur), abonne l'appareil et l'enregistre côté serveur. */
export async function enablePush(store: Store): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(__VAPID_PUBLIC_KEY__) }));
  await store.savePushSubscription(toSubscriptionData(sub));
  return 'granted';
}

/** Ré-enregistre l'abonnement existant (ex. : il a été renouvelé par le navigateur, ou nouveau compte sur l'appareil). */
export async function syncPush(store: Store): Promise<void> {
  if (pushState() !== 'granted') return;
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  const sub = await registration?.pushManager.getSubscription();
  if (sub) await store.savePushSubscription(toSubscriptionData(sub));
}

export async function disablePush(store: Store): Promise<void> {
  if (pushState() !== 'granted') return;
  // `ready` ne se résout jamais sans service worker (développement) : on n'attend pas plus de 3 s.
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  if (!registration) return;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  await store.deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
