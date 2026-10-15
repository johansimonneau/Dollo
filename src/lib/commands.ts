import type { DiaperType } from './types';

/**
 * Commandes en langage naturel, communes à la dictée vocale (« biberon 120 ») et aux liens d'action
 * (`/?app&do=biberon 120`, utilisables par Siri / l'app Raccourcis ou épinglés sur l'écran d'accueil).
 */
export type Command =
  | { type: 'bottle'; ml: number | null }
  | { type: 'diaper'; diaperType: DiaperType }
  | { type: 'breast'; side: 'left' | 'right' | 'next' }
  | { type: 'sleep'; mode: 'start' | 'stop' | 'toggle' }
  | { type: 'stopFeed' }
  | { type: 'temp'; c: number }
  | { type: 'med'; name: string };

const norm = (s: string) =>
  ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9,.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(` ${w} `));

/** Noms usuels, avec la graphie à enregistrer. */
const MEDS: [RegExp, string][] = [
  [/ vitamine d | vit d | zymad | uvesterol | adrigyl /, 'Vitamine D'],
  [/ doliprane /, 'Doliprane'],
  [/ dafalgan /, 'Dafalgan'],
  [/ efferalgan /, 'Efferalgan'],
  [/ paracetamol /, 'Paracétamol'],
  [/ vitamine k /, 'Vitamine K'],
];

/** Comprend une phrase (dictée ou lien) ; null si ce n'est pas une commande reconnue. */
export function parseCommand(input: string): Command | null {
  const t = norm(input);
  if (t.trim() === '') return null;

  // Température : « température 38,2 », « fièvre 38 5 », « 38 degrés 4 »
  const temp = t.match(/ (?:temperature|temp|fievre|thermometre)?\s*(3[4-9]|4[0-3])(?:(?:\s*(?:[,.]|degres?|virgule)\s*|\s+)(\d)(?!\d))?\s*(?:degres?)? /);
  if (temp && (has(t, 'temperature', 'temp', 'fievre', 'thermometre', 'degre', 'degres') || /3[4-9][,.]\d|4[0-3][,.]\d/.test(t))) {
    const c = Number(`${temp[1]}.${temp[2] ?? '0'}`);
    if (c >= 34 && c <= 43) return { type: 'temp', c };
  }

  for (const [re, name] of MEDS) if (re.test(t)) return { type: 'med', name };
  const med = t.match(/ (?:medicament|medoc|traitement) (.+) $/);
  if (med) {
    const name = input.trim().split(/\s+/).slice(1).join(' ');
    return name ? { type: 'med', name: name.charAt(0).toUpperCase() + name.slice(1) } : null;
  }

  if (has(t, 'biberon', 'bib', 'biberons') || / \d{2,3} ?ml /.test(t)) {
    const n = t.match(/ (\d{2,3}) ?(?:ml|millilitres?)? /);
    const ml = n ? Number(n[1]) : null;
    return { type: 'bottle', ml: ml !== null && ml > 0 && ml <= 500 ? ml : null };
  }

  if (has(t, 'couche', 'change', 'pipi', 'caca', 'selles', 'selle')) {
    const pee = has(t, 'pipi', 'mouillee', 'urine');
    const poop = has(t, 'caca', 'selles', 'selle');
    if (has(t, 'les deux', 'deux') || (pee && poop)) return { type: 'diaper', diaperType: 'both' };
    if (poop) return { type: 'diaper', diaperType: 'poop' };
    return { type: 'diaper', diaperType: 'pee' };
  }

  if (has(t, 'fin tetee', 'stop tetee', 'tetee terminee', 'fin de tetee', 'termine', 'terminer', 'fini')) return { type: 'stopFeed' };

  if (has(t, 'sein', 'tetee', 'tete', 'allaitement')) {
    if (has(t, 'gauche')) return { type: 'breast', side: 'left' };
    if (has(t, 'droit', 'droite')) return { type: 'breast', side: 'right' };
    return { type: 'breast', side: 'next' };
  }

  if (has(t, 'reveil', 'reveille', 'reveillee', 'debout', 'reveillé')) return { type: 'sleep', mode: 'stop' };
  if (has(t, 'dodo', 'sieste', 'dort', 'endormi', 'endormie', 'couche pour la nuit', 'nuit')) return { type: 'sleep', mode: 'start' };
  if (has(t, 'sommeil')) return { type: 'sleep', mode: 'toggle' };

  return null;
}

/** Phrase de confirmation : « Biberon 120 ml », « Couche : caca »… (affichée avant / après exécution). */
export function describeCommand(c: Command): string {
  switch (c.type) {
    case 'bottle':
      return c.ml ? `Biberon ${c.ml} ml` : 'Biberon';
    case 'diaper':
      return `Couche : ${c.diaperType === 'pee' ? 'pipi' : c.diaperType === 'poop' ? 'caca' : 'pipi + caca'}`;
    case 'breast':
      return c.side === 'left' ? 'Tétée sein gauche' : c.side === 'right' ? 'Tétée sein droit' : 'Tétée (sein suggéré)';
    case 'sleep':
      return c.mode === 'stop' ? 'Réveil' : c.mode === 'start' ? 'Dodo' : 'Dodo / réveil';
    case 'stopFeed':
      return 'Fin de la tétée';
    case 'temp':
      return `Température ${String(c.c).replace('.', ',')} °C`;
    case 'med':
      return `Médicament : ${c.name}`;
  }
}

export const COMMAND_EXAMPLES = ['biberon 120', 'couche pipi', 'caca', 'sein gauche', 'dodo', 'réveil', 'température 38,2', 'vitamine D'];
