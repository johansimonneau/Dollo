import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { readRouteEnv, wantsLanding } from './landing/route';
import { setupUpdates } from './lib/updates';
import './styles.css';

// Page de présentation à un nouveau visiteur ; l'app directement pour tout usage existant (voir landing/route.ts).
const Landing = lazy(() => import('./landing/Landing'));
const showLanding = wantsLanding(readRouteEnv());

// Mises à jour sans interruption (voir lib/updates.ts).
setupUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLanding ? (
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
    ) : (
      <App />
    )}
    <Analytics />
  </StrictMode>,
);
