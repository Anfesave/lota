import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL } from './global-setup.js';

const PUERTO = 4173;
export const BASE_URL = `http://127.0.0.1:${PUERTO}`;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'off',
  },

  /**
   * Se usa el Chrome instalado en el sistema (`channel: 'chrome'`) en vez del
   * Chromium que descarga Playwright: la descarga falla en esta maquina y el
   * navegador real es igual de valido para estos tests. Si prefieres el de
   * Playwright, corre `pnpm exec playwright install chromium` y quita el canal.
   */
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],

  /**
   * Un solo proceso Node sirviendo la SPA compilada y la API, igual que en
   * Render. Requiere `pnpm build` antes.
   *
   * No se usa NODE_ENV=production a proposito: ahi las cookies serian `secure`
   * y no viajarian por http, y ademas los aceleradores de partida se ignoran.
   */
  webServer: {
    command: 'node ../server/dist/index.js',
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      PORT: String(PUERTO),
      HOST: '127.0.0.1',
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: 'secreto-de-e2e-con-mas-de-treinta-y-dos-caracteres',
      PUBLIC_URL: BASE_URL,
      // Partida rapida: cuenta atras de 1 s y un numero cada 120 ms.
      TEST_COUNTDOWN_SECONDS: '1',
      TEST_CALL_INTERVAL_MS: '120',
    },
  },
});
