import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';

/** Base propia del e2e: no toca ni la de desarrollo ni la de los unitarios. */
export const E2E_DATABASE_URL = 'postgres://lota:lota@127.0.0.1:5432/lota_e2e';
const ADMIN_DATABASE_URL = 'postgres://lota:lota@127.0.0.1:5432/lota';
const migrationsFolder = fileURLToPath(new URL('../server/drizzle', import.meta.url));

export default async function globalSetup(): Promise<void> {
  const admin = new Client({
    connectionString: ADMIN_DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      'No se pudo conectar a Postgres en 127.0.0.1:5432. Levantalo con `pnpm db:up` ' +
        `antes de correr los tests e2e.\nCausa: ${String(error)}`,
    );
  }

  try {
    const existe = await admin.query('select 1 from pg_database where datname = $1', ['lota_e2e']);
    if (existe.rowCount === 0) await admin.query('create database lota_e2e');
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    // Cada corrida empieza sin usuarios: los nombres se repiten entre corridas.
    await pool.query('truncate table users cascade');
  } finally {
    await pool.end();
  }
}
