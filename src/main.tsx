import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { readRouteEnv, wantsLanding } from './landing/route';
import './styles.css';

// Page de présentation à un nouveau visiteur ; l'app directement pour tout usage existant (voir landing/route.ts).
const Landing = lazy(() => import('./landing/Landing'));
const showLanding = wantsLanding(readRouteEnv());

// Mise à jour silencieuse : la nouvelle version s'applique au prochain lancement.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLanding ? (
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
