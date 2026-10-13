import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Garde-fou : la valeur injectée dans le bundle est lisible par tous les visiteurs. Si on y colle par erreur la clé
 * SECRÈTE (`sb_secret_…` ou l'ancienne `service_role`, qui contourne toute la sécurité de la base), le build s'arrête.
 */
function assertPublicKey(key: string) {
  if (!key) return;
  let role: unknown;
  if (key.startsWith('sb_secret_')) role = 'secret';
  else if (key.split('.').length === 3) {
    try {
      role = (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) as { role?: unknown }).role;
    } catch {
      /* pas un JWT lisible : on laisse passer, Supabase refusera une clé invalide */
    }
  }
  if (role === 'secret' || role === 'service_role') {
    throw new Error(
      "SUPABASE_ANON_KEY contient une clé SECRÈTE (service_role / sb_secret_…). Elle serait publique dans l'application. " +
        'Utilisez la clé publique : « anon » ou « publishable » (Supabase → Settings → API Keys).',
    );
  }
}

/**
 * Ne garde que la RACINE de l'adresse Supabase (`https://xxxx.supabase.co`). Une valeur copiée depuis la mauvaise page
 * (`…/rest/v1/`), avec un `/` final, des espaces ou des guillemets donnerait des appels vers `/rest/v1/auth/v1/…`
 * et l'erreur « Invalid path specified in request URL ».
 */
function normalizeSupabaseUrl(raw: string): string {
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  if (!cleaned) return '';
  let origin: string;
  try {
    origin = new URL(cleaned).origin;
  } catch {
    throw new Error(`SUPABASE_URL n'est pas une adresse valide : « ${raw} ». Attendu : https://xxxx.supabase.co`);
  }
  if (origin !== cleaned) {
    console.warn(`[dollo] SUPABASE_URL corrigée : « ${raw} » → « ${origin} » (seule la racine est utilisée).`);
  }
  return origin;
}

/** Retire espaces, retours à la ligne et guillemets parasites collés avec la clé. */
const cleanKey = (raw: string) => raw.trim().replace(/^["']+|["']+$/g, '').trim();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // On n'expose explicitement que l'URL et l'anon key (publiques par conception).
  // Surtout pas de `envPrefix: ['SUPABASE_']` : cela fuiterait une éventuelle service_role key dans le bundle.
  const pick = (...keys: string[]) => keys.map((k) => env[k]).find(Boolean) ?? '';
  const publicKey = cleanKey(pick('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'));
  assertPublicKey(publicKey);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Dollo – suivi bébé',
          short_name: 'Dollo',
          description: 'Tétées, couches, siestes : le journal de bébé en un geste, partagé entre parents.',
          lang: 'fr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#fff6ee',
          theme_color: '#0b7a6d',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { navigateFallback: '/index.html' },
      }),
    ],
    define: {
      __SUPABASE_URL__: JSON.stringify(normalizeSupabaseUrl(pick('VITE_SUPABASE_URL', 'SUPABASE_URL'))),
      __SUPABASE_ANON_KEY__: JSON.stringify(publicKey),
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
  };
});
