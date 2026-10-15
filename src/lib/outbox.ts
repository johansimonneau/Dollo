import type { BabyEvent, NewEvent } from './types';

/**
 * File d'attente des saisies faites sans réseau. Chaque opération porte l'identifiant (généré sur le téléphone) de
 * l'événement concerné : un biberon noté hors ligne puis corrigé, ou supprimé, reste cohérent.
 */
export type Op =
  | { kind: 'add'; id: string; event: NewEvent }
  | { kind: 'update'; id: string; babyId: string; patch: Partial<NewEvent> }
  | { kind: 'delete'; id: string; babyId: string };

export const opBabyId = (op: Op) => (op.kind === 'add' ? op.event.babyId : op.babyId);

/**
 * Simplifie la file : ajout puis modifications → un seul ajout ; ajout puis suppression → rien du tout ;
 * modifications successives → une seule. L'ordre relatif des autres opérations est conservé.
 */
export function compact(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const i = out.findIndex((o) => o.id === op.id);
    if (i === -1) {
      out.push(op);
      continue;
    }
    const prev = out[i];
    if (op.kind === 'update') {
      if (prev.kind === 'add') out[i] = { ...prev, event: { ...prev.event, ...op.patch } };
      else if (prev.kind === 'update') out[i] = { ...prev, patch: { ...prev.patch, ...op.patch } };
      else out.push(op); // modifier un événement supprimé : sans effet côté serveur, on le laisse décider
    } else if (op.kind === 'delete') {
      if (prev.kind === 'add') out.splice(i, 1); // jamais parti : rien à envoyer
      else out[i] = op;
    } else out.push(op);
  }
  return out;
}

/** Ce que l'utilisateur doit voir : la dernière liste connue + ses saisies pas encore envoyées. */
export function applyOps(events: BabyEvent[], ops: Op[], babyId: string): BabyEvent[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const op of ops) {
    if (opBabyId(op) !== babyId) continue;
    if (op.kind === 'add') byId.set(op.id, { ...op.event, id: op.id });
    else if (op.kind === 'update') {
      const cur = byId.get(op.id);
      if (cur) byId.set(op.id, { ...cur, ...op.patch });
    } else byId.delete(op.id);
  }
  return [...byId.values()].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
