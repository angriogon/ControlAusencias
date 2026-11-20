import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permite publicar en GitHub Pages bajo /<repo>/ (lo fija el workflow).
const base = process.env.BASE_PATH ?? '/';

/**
 * Política de seguridad del navegador (CSP), solo en la versión compilada: el navegador
 * solo ejecuta código de la propia app y solo se conecta a ella y a nuestro Supabase.
 * (En desarrollo no, porque Vite usa scripts en línea para recargar al vuelo.)
 */
function securityHeaders(supabaseUrl: string): Plugin {
  const sb = supabaseUrl ? new URL(supabaseUrl).host : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // atributos style de React (colores de las claves)
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${sb ? ` https://${sb} wss://${sb}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'cabeceras-seguridad',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'same-origin' }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  base,
  plugins: [
    securityHeaders(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? ''),
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
  test: { environment: 'node', exclude: ['e2e/**', 'node_modules/**', 'dist*/**'] },
}));
