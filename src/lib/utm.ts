/**
 * Suivi persistant des campagnes (UTM et identifiants de clic publicitaires).
 *
 * Les paramètres ne vivent que dans l'adresse de la première page : ils disparaissent dès que le visiteur clique sur
 * « Ouvrir l'app » (`/?app`), revient d'un lien de confirmation ou rouvre l'app installée. On les garde donc sur
 * l'appareil :
 * - premier contact : la toute première campagne qui a amené ce visiteur, jamais écrasée ;
 * - dernier contact : la campagne la plus récente, oubliée après 90 jours sans nouvelle campagne.
 * Le dernier contact est rajouté aux pages vues envoyées à Vercel Analytics, et les deux sont joints à l'inscription.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
/** Google, Meta, TikTok, Microsoft, LinkedIn. */
export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id'] as const;

const KEY = 'dollo:utm';
export const LAST_TOUCH_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_LENGTH = 200;

export interface Touch {
  /** Paramètres de campagne présents dans l'adresse (UTM et identifiants de clic). */
  params: Record<string, string>;
  /** Horodatage (ms). */
  at: number;
  /** Page d'arrivée (chemin, sans les paramètres). */
  landing: string;
  /** Site d'origine, s'il est connu. */
  referrer?: string;
}

export interface Attribution {
  first: Touch;
  last?: Touch;
}

/** Extrait une visite de campagne d'une adresse, ou `null` si elle n'en porte pas. */
export function parseTouch(search: string, now: number, landing: string, referrer = ''): Touch | null {
  const query = new URLSearchParams(search);
  const params: Record<string, string> = {};
  for (const key of [...UTM_KEYS, ...CLICK_ID_KEYS]) {
    const value = query.get(key)?.trim();
    if (value) params[key] = value.slice(0, MAX_LENGTH);
  }
  if (Object.keys(params).length === 0) return null;
  let origin = '';
  try {
    origin = referrer ? new URL(referrer).hostname : '';
  } catch {
    /* référent illisible : ignoré */
  }
  return { params, at: now, landing, ...(origin ? { referrer: origin } : {}) };
}

/** Combine l'historique enregistré avec la visite en cours. */
export function mergeAttribution(prev: Attribution | null, touch: Touch | null, now: number): Attribution | null {
  if (touch) return { first: prev?.first ?? touch, last: touch };
  if (!prev) return null;
  if (prev.last && now - prev.last.at > LAST_TOUCH_MS) return { first: prev.first };
  return prev;
}

/** UTM du dernier contact encore valable. */
export function activeUtm(a: Attribution | null): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = a?.last?.params[key];
    if (value) utm[key] = value;
  }
  return utm;
}

/** Ajoute les UTM à une adresse qui n'en porte aucun (on ne mélange jamais deux campagnes). */
export function withUtm(url: string, utm: Record<string, string>): string {
  if (Object.keys(utm).length === 0) return url;
  try {
    const u = new URL(url);
    if (UTM_KEYS.some((key) => u.searchParams.has(key))) return url;
    for (const [key, value] of Object.entries(utm)) u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url;
  }
}

/** Version à plat pour les métadonnées du compte : `first_utm_source`, `last_gclid`, `first_landing`… */
export function attributionMetadata(a: Attribution | null): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (prefix: string, t?: Touch) => {
    if (!t) return;
    for (const [key, value] of Object.entries(t.params)) out[`${prefix}_${key}`] = value;
    out[`${prefix}_landing`] = t.landing;
    out[`${prefix}_at`] = new Date(t.at).toISOString();
    if (t.referrer) out[`${prefix}_referrer`] = t.referrer;
  };
  add('first', a?.first);
  add('last', a?.last);
  return out;
}

let current: Attribution | null = null;

/** Attribution de cet appareil (gardée en mémoire si le stockage est indisponible). */
export function readAttribution(): Attribution | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

/** À appeler au démarrage, avant que l'adresse ne soit nettoyée. Tolérant : stockage bloqué, navigation privée… */
export function captureUtm(): Attribution | null {
  const prev = readAttribution();
  const now = Date.now();
  const touch = parseTouch(window.location.search, now, window.location.pathname, document.referrer);
  const next = mergeAttribution(prev, touch, now);
  current = next;
  if (next !== prev) {
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : l'attribution vaut au moins pour cette visite */
    }
  }
  return next;
}
