import { useState } from 'react';
import { errorMessage } from '../data/store';
import { fmtVolume } from '../lib/labels';
import { activeBags, expiresAt, MILK_RULES, milkStatus, stockTotals } from '../lib/milk';
import { dayKey, fmtClock, fmtDate } from '../lib/time';
import type { MilkBag } from '../lib/types';
import { Sheet } from './Sheet';

interface Props {
  bags: MilkBag[];
  now: number;
  /** Donner un sachet en biberon (crée le biberon et sort le sachet du stock). */
  onGive: (bag: MilkBag) => Promise<void>;
  onThaw: (bag: MilkBag) => Promise<void>;
  onDiscard: (bag: MilkBag) => Promise<void>;
  onClose: () => void;
}

const STORAGE_LABEL: Record<MilkBag['storage'], string> = { fridge: 'Frigo', freezer: 'Congélateur', thawed: 'Décongelé' };

/** « avant le 16 oct. à 14h30 » / « avant le 12 févr. 2027 » */
export function fmtLimit(bag: MilkBag): string {
  const ms = expiresAt(bag);
  const iso = new Date(ms).toISOString();
  return bag.storage === 'freezer' ? `avant le ${fmtDate(dayKey(ms))}` : `avant le ${fmtDate(dayKey(ms))} à ${fmtClock(iso)}`;
}

/** Stock de lait tiré : le sachet à utiliser en premier en haut ; donner, décongeler, jeter. */
export function MilkStock({ bags, now, onGive, onThaw, onDiscard, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = activeBags(bags);
  const t = stockTotals(bags, now);

  const act = async (bag: MilkBag, fn: (b: MilkBag) => Promise<void>) => {
    setBusy(bag.id);
    setError(null);
    try {
      await fn(bag);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Stock de lait" onClose={onClose}>
      <p className="milk-totals">
        <span>
          <strong>{fmtVolume(t.fridgeMl)}</strong> au frigo ({t.fridgeCount})
        </span>
        <span>
          <strong>{fmtVolume(t.freezerMl)}</strong> au congélateur ({t.freezerCount})
        </span>
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {list.length === 0 ? (
        <p className="hint">Aucun lait en stock. Un tirage peut être mis au frigo ou au congélateur en l'enregistrant.</p>
      ) : (
        <ul className="milk-list">
          {list.map((b) => {
            const st = milkStatus(b, now);
            return (
              <li key={b.id} className={`milk-bag ${st}`}>
                <div className="milk-head">
                  <strong>{b.volumeMl} ml</strong>
                  <span className={`milk-storage ${b.storage}`}>{STORAGE_LABEL[b.storage]}</span>
                </div>
                <p className="milk-when">
                  Tiré le {fmtDate(dayKey(b.pumpedAt))} à {fmtClock(b.pumpedAt)} ·{' '}
                  {st === 'expired' ? <strong>périmé : à jeter</strong> : <span>{fmtLimit(b)}</span>}
                </p>
                <div className="milk-actions">
                  {st !== 'expired' && b.storage !== 'freezer' && (
                    <button type="button" className="btn small primary" disabled={busy === b.id} onClick={() => void act(b, onGive)}>
                      Donner en biberon
                    </button>
                  )}
                  {st !== 'expired' && b.storage === 'freezer' && (
                    <button type="button" className="btn small" disabled={busy === b.id} onClick={() => void act(b, onThaw)}>
                      Décongeler
                    </button>
                  )}
                  <button type="button" className="link-btn danger" disabled={busy === b.id} onClick={() => void act(b, onDiscard)}>
                    Jeter
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="report-note">
        Repères : {MILK_RULES.fridgeHours} h au réfrigérateur, {MILK_RULES.freezerMonths} mois au congélateur, {MILK_RULES.thawedHours} h une fois
        décongelé (au réfrigérateur, sans recongeler). Les consignes de votre maternité priment.
      </p>
    </Sheet>
  );
}
