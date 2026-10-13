import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // On n'expose explicitement que l'URL et l'anon key (publiques par conception).
  // Surtout pas de `envPrefix: ['SUPABASE_']` : cela fuiterait une éventuelle service_role key dans le bundle.
  const pick = (...keys: string[]) => keys.map((k) => env[k]).find(Boolean) ?? '';

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
          background_color: '#f6f4ef',
          theme_color: '#2f6f68',
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
      __SUPABASE_URL__: JSON.stringify(pick('VITE_SUPABASE_URL', 'SUPABASE_URL')),
      __SUPABASE_ANON_KEY__: JSON.stringify(pick('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')),
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
  };
});
