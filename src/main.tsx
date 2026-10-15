import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics, type BeforeSend } from '@vercel/analytics/react';
import App from './App';
import { readRouteEnv, wantsLanding } from './landing/route';
import { setupUpdates } from './lib/updates';
import { activeUtm, captureUtm, withUtm } from './lib/utm';
import './styles.css';

// Page de présentation à un nouveau visiteur ; l'app directement pour tout usage existant (voir landing/route.ts).
const Landing = lazy(() => import('./landing/Landing'));
const showLanding = wantsLanding(readRouteEnv());

// Campagnes publicitaires : mémorisées avant que l'adresse ne change, puis rattachées à chaque page vue (voir lib/utm.ts).
const utm = activeUtm(captureUtm());
const addUtm: BeforeSend = (event) => ({ ...event, url: withUtm(event.url, utm) });

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
    <Analytics beforeSend={addUtm} />
  </StrictMode>,
);
