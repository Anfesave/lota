import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';

/**
 * Los tests de integracion corren contra una base aparte (`lota_test`) para no
 * tocar los datos de desarrollo. Requiere Postgres levantado: `pnpm db:up`.
 */
export const TEST_DATABASE_URL = 'postgres://lota:lota@localhost:5432/lota_test';
const ADMIN_DATABASE_URL = 'postgres://lota:lota@localhost:5432/lota';
const migrationsFolder = fileURLToPath(new URL('./drizzle', import.meta.url));

export async function setup(): Promise<void> {
  const admin = new Client({
    connectionString: ADMIN_DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      'No se pudo conectar a Postgres en localhost:5432. Levantalo con `pnpm db:up` ' +
        `antes de correr los tests del servidor.\nCausa: ${String(error)}`,
    );
  }

  try {
    // CREATE DATABASE no admite IF NOT EXISTS.
    const existe = await admin.query('select 1 from pg_database where datname = $1', ['lota_test']);
    if (existe.rowCount === 0) await admin.query('create database lota_test');
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
