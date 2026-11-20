import { defineConfig, devices } from '@playwright/test';

/*
 * Pruebas de pantalla (de punta a punta) en MODO LOCAL: datos ficticios en el navegador,
 * sin tocar Supabase. Se compila sin claves y se sirve con «vite preview».
 *   npm run e2e
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'off',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /movil/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /movil/ },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
