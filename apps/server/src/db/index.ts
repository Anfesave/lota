import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Neon exige TLS; el Postgres local de docker-compose no lo tiene.
 * Neon usa certificados de una CA publica, asi que verificamos de verdad
 * (equivalente a sslmode=verify-full, mas estricto que el require de su consola).
 */
export function sslOptionsFor(connectionString: string): PoolConfig['ssl'] {
  const url = new URL(connectionString);
  const esLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (esLocal || url.searchParams.get('sslmode') === 'disable') return false;
  return { rejectUnauthorized: true };
}

/**
 * Fijamos el TLS con la opcion `ssl`, asi que quitamos `sslmode` de la cadena:
 * si no, pg-connection-string avisa de que cambiara su semantica en pg 9.
 */
function stripSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

/**
 * Pool pequeno: detras del pooler de Neon no hace falta abrir muchas conexiones.
 * El timeout generoso cubre el despertar de Neon tras el scale-to-zero del plan Free.
 */
export function poolConfigFor(connectionString: string): PoolConfig {
  return {
    connectionString: stripSslMode(connectionString),
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ssl: sslOptionsFor(connectionString),
  };
}

let pool: Pool | undefined;
let database: Database | undefined;

/** Conexion perezosa: importar este modulo no abre sockets (los tests no necesitan BD). */
function ensureConnection(): { pool: Pool; database: Database } {
  if (!pool || !database) {
    const nuevoPool = new Pool(poolConfigFor(env.DATABASE_URL));
    // Sin este handler, un corte de red de Neon tumbaria el proceso entero.
    nuevoPool.on('error', (error) =>
      console.error('error inesperado en el pool de Postgres', error),
    );
    pool = nuevoPool;
    database = drizzle(nuevoPool, { schema });
    return { pool: nuevoPool, database };
  }
  return { pool, database };
}

export function getDb(): Database {
  return ensureConnection().database;
}

/** Ping barato para /health/db. Lanza si la BD no responde. */
export async function pingDb(): Promise<void> {
  const client = await ensureConnection().pool.connect();
  try {
    await client.query('select 1');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
