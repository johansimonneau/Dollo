export interface RouteEnv {
  pathname: string;
  search: string;
  hash: string;
  /** App ouverte depuis l'écran d'accueil (PWA installée). */
  standalone: boolean;
  /** Des données locales existent déjà sur cet appareil. */
  hasLocalData: boolean;
  /** Une session de connexion existe déjà sur cet appareil. */
  hasSession: boolean;
}

/**
 * Page de présentation ou app ?
 *
 * La page de présentation ne s'affiche qu'à un NOUVEAU visiteur sur l'adresse racine. Tout ce qui ressemble à un
 * usage de l'app ouvre l'app directement, pour ne jamais gêner un parent à 3 h du matin :
 * - app installée sur l'écran d'accueil ;
 * - `?app` (bouton « Ouvrir l'app ») ;
 * - retour d'un lien de connexion / d'une erreur d'authentification Supabase (jetons dans l'adresse) ;
 * - données ou session déjà présentes sur l'appareil.
 * `?landing` force la page (utile pour la montrer à quelqu'un).
 */
export function wantsLanding(env: RouteEnv): boolean {
  const params = new URLSearchParams(env.search);
  if (params.has('landing')) return true;
  if (env.pathname !== '/') return false;
  if (env.standalone) return false;
  if (params.has('app') || params.has('code') || params.has('error')) return false;
  if (/(^|[#&])(access_token|refresh_token|error|error_code|type)=/.test(env.hash)) return false;
  if (env.hasLocalData || env.hasSession) return false;
  return true;
}

/** Lit l'environnement réel du navigateur (tolérant : stockage bloqué, navigation privée…). */
export function readRouteEnv(): RouteEnv {
  let hasLocalData = false;
  let hasSession = false;
  try {
    hasLocalData = localStorage.getItem('dollo:v1') !== null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) hasSession = true;
    }
  } catch {
    /* stockage indisponible : on traite l'appareil comme neuf */
  }
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    standalone,
    hasLocalData,
    hasSession,
  };
}
