import { describe, expect, it } from 'vitest';
import { applyOps, compact, type Op } from './outbox';
import { emptyEvent, type BabyEvent } from './types';

const at = (h: number) => new Date(2026, 9, 14, h).toISOString();
const bottle = (babyId = 'b1', h = 3) => ({ ...emptyEvent(babyId, 'bottle', at(h)), amountMl: 90 });
const server: BabyEvent[] = [{ ...emptyEvent('b1', 'diaper', at(1)), id: 's1', diaperType: 'pee' }];

describe('file hors ligne', () => {
  it('ajout puis correction → un seul ajout corrigé', () => {
    const ops: Op[] = [
      { kind: 'add', id: 'n1', event: bottle() },
      { kind: 'update', id: 'n1', babyId: 'b1', patch: { amountMl: 120 } },
    ];
    expect(compact(ops)).toEqual([{ kind: 'add', id: 'n1', event: { ...bottle(), amountMl: 120 } }]);
  });

  it('ajout puis suppression → rien à envoyer', () => {
    expect(compact([{ kind: 'add', id: 'n1', event: bottle() }, { kind: 'delete', id: 'n1', babyId: 'b1' }])).toEqual([]);
  });

  it("modifications successives d'un événement du serveur → une seule, et l'ordre des autres est gardé", () => {
    const ops: Op[] = [
      { kind: 'update', id: 's1', babyId: 'b1', patch: { note: 'a' } },
      { kind: 'add', id: 'n1', event: bottle() },
      { kind: 'update', id: 's1', babyId: 'b1', patch: { diaperType: 'both' } },
    ];
    expect(compact(ops)).toEqual([
      { kind: 'update', id: 's1', babyId: 'b1', patch: { note: 'a', diaperType: 'both' } },
      { kind: 'add', id: 'n1', event: bottle() },
    ]);
  });

  it("l'écran montre la liste connue + les saisies en attente, triées, pour ce bébé seulement", () => {
    const ops: Op[] = [
      { kind: 'add', id: 'n1', event: bottle('b1', 3) },
      { kind: 'add', id: 'other', event: bottle('b2', 4) },
      { kind: 'update', id: 's1', babyId: 'b1', patch: { diaperType: 'both' } },
    ];
    const view = applyOps(server, ops, 'b1');
    expect(view.map((e) => e.id)).toEqual(['n1', 's1']);
    expect(view[1].diaperType).toBe('both');
    expect(applyOps(server, [{ kind: 'delete', id: 's1', babyId: 'b1' }], 'b1')).toEqual([]);
  });
});
