import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permite publicar en GitHub Pages bajo /<repo>/ (lo fija el workflow).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Control de Ausencias',
        short_name: 'Ausencias',
        description: 'Calendario compartido de ausencias y turnos del equipo',
        lang: 'es-ES',
        theme_color: '#1f4e79',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Nunca cachear las llamadas a Supabase: los datos deben ser siempre los del servidor.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' },
});
