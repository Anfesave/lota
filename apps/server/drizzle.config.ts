import { defineConfig } from 'drizzle-kit';

/**
 * Las migraciones usan la conexion DIRECTA (sin el pooler de Neon): PgBouncer en
 * modo transaccion no soporta todo el DDL. En local ambas variables apuntan al
 * mismo Postgres de docker-compose.
 */
const url =
  process.env['DATABASE_URL_DIRECT'] ??
  process.env['DATABASE_URL'] ??
  'postgres://lota:lota@localhost:5432/lota';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
