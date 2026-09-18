import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./vitest.global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      // Base separada de la de desarrollo; la crea y migra el globalSetup.
      DATABASE_URL: 'postgres://lota:lota@localhost:5432/lota_test',
      SESSION_SECRET: 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres',
      // Partidas rápidas: sin cuenta atrás y con el locutor acelerado.
      TEST_COUNTDOWN_SECONDS: '0',
      TEST_CALL_INTERVAL_MS: '15',
    },
    // Las suites comparten la base: en paralelo se pisarian los TRUNCATE.
    fileParallelism: false,
  },
});
