import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage, type Store } from '../data/store';
import { unlocked, UNLOCKED, type BillingStatus, type Feature } from '../lib/billing';
import { Paywall } from './Paywall';
import { useToast } from './toast';

interface PremiumApi {
  billing: BillingStatus;
  /** Fonction accessible pour le bébé affiché ? */
  has: (feature: Feature) => boolean;
  /** true si la fonction est accessible ; sinon ouvre la présentation de Dollo+ et renvoie false. */
  require: (feature: Feature) => boolean;
  /** Présentation de Dollo+ (sans fonction précise : depuis les réglages ou un bandeau). */
  openPaywall: (feature?: Feature) => void;
  /** Portail Stripe : moyen de paiement, factures, résiliation. */
  manage: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PremiumApi>({
  billing: UNLOCKED,
  has: () => true,
  require: () => true,
  openPaywall: () => undefined,
  manage: async () => undefined,
  refresh: async () => undefined,
});

export const usePremium = () => useContext(Ctx);

const cacheKey = (userId: string | null) => `dollo:billing:${userId ?? 'local'}`;
function readCache(userId: string | null): BillingStatus | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as BillingStatus) : null;
  } catch {
    return null;
  }
}

interface Props {
  store: Store;
  userId: string | null;
  /** Bébé affiché (null pendant la création du premier). */
  babyId: string | null;
  /** Une nounou ne peut pas acheter Dollo+ pour la famille : on lui explique de demander aux parents. */
  nanny: boolean;
  children: ReactNode;
}

/**
 * État Dollo+ partagé par tous les écrans, et fenêtre d'upsell.
 * Hors ligne ou en cas d'erreur : dernier état connu, sinon tout est ouvert (on ne bloque jamais un parent pour un
 * problème de réseau ; la base garde les verrous qui comptent).
 */
export function PremiumProvider({ store, userId, babyId, nanny, children }: Props) {
  const toast = useToast();
  const [billing, setBilling] = useState<BillingStatus>(() => readCache(userId) ?? UNLOCKED);
  const [paywall, setPaywall] = useState<{ feature?: Feature } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await store.getBilling();
      setBilling(next);
      try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(next));
      } catch {
        /* cache non vital */
      }
    } catch {
      /* hors ligne : on garde l'état connu */
    }
  }, [store, userId]);

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Retour de Stripe (?billing=success|cancel) : le webhook peut avoir quelques secondes de retard, on relit jusqu'à
  // voir Dollo+ actif.
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('billing');
    if (!result) return;
    params.delete('billing');
    const rest = params.toString().replace(/=(&|$)/g, '$1');
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    if (result !== 'success') return;
    toast.show('Merci ! Activation de Dollo+…', { durationMs: 4000 });
    let tries = 0;
    let stop = false;
    const poll = async () => {
      while (!stop && tries++ < 10) {
        const next = await store.getBilling().catch(() => null);
        if (next?.premium) {
          setBilling(next);
          try {
            localStorage.setItem(cacheKey(userId), JSON.stringify(next));
          } catch {
            /* cache non vital */
          }
          toast.show('Bienvenue dans Dollo+ ! Tout est débloqué, pour vous et pour toute la famille.', { durationMs: 8000 });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) toast.show("Paiement reçu. L'activation peut prendre une minute : rouvrez l'app si besoin.", { durationMs: 10_000 });
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [store, toast, userId]);

  const api = useMemo<PremiumApi>(() => {
    const has = (f: Feature) => unlocked(billing, f, babyId);
    return {
      billing,
      has,
      require: (f) => {
        if (has(f)) return true;
        setPaywall({ feature: f });
        return false;
      },
      openPaywall: (feature) => setPaywall({ feature }),
      manage: async () => {
        try {
          window.location.assign(await store.openBillingPortal());
        } catch (e) {
          toast.show(errorMessage(e), { tone: 'error' });
        }
      },
      refresh,
    };
  }, [billing, babyId, store, toast, refresh]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {paywall && <Paywall store={store} feature={paywall.feature} canBuy={!nanny && store.mode === 'cloud'} billing={billing} onClose={() => setPaywall(null)} />}
    </Ctx.Provider>
  );
}

/** Petit repère « Dollo+ » sur un bouton ou un onglet verrouillé. */
export function PlusTag() {
  return <span className="plus-tag">Dollo+</span>;
}
