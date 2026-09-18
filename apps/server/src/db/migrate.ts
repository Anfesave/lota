import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { migrationDatabaseUrl } from '../env.js';
import { poolConfigFor } from './index.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Con el plan Free de Neon la base duerme: el primer intento puede expirar.
const MAX_INTENTOS = 3;

const pool = new Pool({ ...poolConfigFor(migrationDatabaseUrl), max: 1 });

try {
  for (let intento = 1; ; intento++) {
    try {
      await migrate(drizzle(pool), { migrationsFolder });
      console.warn('Migraciones aplicadas.');
      break;
    } catch (error) {
      if (intento >= MAX_INTENTOS) throw error;
      const esperaMs = 2_000 * intento;
      console.warn(`Fallo el intento ${intento} de migrar; reintentando en ${esperaMs} ms...`);
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
} finally {
  await pool.end();
}
