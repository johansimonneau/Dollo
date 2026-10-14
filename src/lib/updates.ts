import { registerSW } from 'virtual:pwa-register';

/**
 * Mises à jour sans frustration. Une nouvelle version publiée est téléchargée en arrière-plan, puis appliquée
 * (rechargement) seulement à un moment où personne ne le remarque :
 * - au lancement, tant que l'utilisateur n'a encore rien touché (rechargement quasi instantané) ;
 * - sinon dès que l'app passe en arrière-plan (téléphone verrouillé, autre app ouverte).
 * Jamais pendant une saisie. La session Supabase et les données sont conservées : aucune déconnexion.
 */
export function shouldApplyUpdate(s: { ready: boolean; hidden: boolean; interacted: boolean }): boolean {
  return s.ready && (s.hidden || !s.interacted);
}

const HOUR = 60 * 60 * 1000;
const RELOAD_KEY = 'dollo:chunk-reload';

export function setupUpdates() {
  let ready = false;
  let interacted = false;
  let applying = false;

  const apply = () => {
    if (applying || !shouldApplyUpdate({ ready, hidden: document.visibilityState === 'hidden', interacted })) return;
    applying = true;
    void updateSW(true);
  };

  const markInteracted = () => {
    interacted = true;
  };
  window.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
  window.addEventListener('keydown', markInteracted, { capture: true, once: true });
  document.addEventListener('visibilitychange', apply);

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      apply();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Une app laissée ouverte des jours (fréquent sur téléphone) vérifie quand même les nouveautés.
      const check = () => void registration.update().catch(() => undefined);
      window.setInterval(check, HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  // Après une mise en ligne, un ancien onglet peut réclamer un fichier qui n'existe plus : on recharge une fois,
  // proprement, au lieu d'afficher une page cassée.
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      /* stockage indisponible : on tente quand même le rechargement */
    }
    event.preventDefault();
    window.location.reload();
  });
}
