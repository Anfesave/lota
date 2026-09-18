import { z } from 'zod';

const LOCAL_DATABASE_URL = 'postgres://lota:lota@localhost:5432/lota';
const DEV_SESSION_SECRET = 'desarrollo-secreto-inseguro-cambiar-en-produccion';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Render inyecta PORT; en local usamos 3000. El host debe ser 0.0.0.0 en Render. */
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  /** Neon CON pooler (el host contiene "-pooler"). La usa la aplicacion. */
  DATABASE_URL: z.string().default(LOCAL_DATABASE_URL),
  /** Neon SIN pooler. Solo para migraciones y DDL. */
  DATABASE_URL_DIRECT: z.string().optional(),

  SESSION_SECRET: z.string().min(32).default(DEV_SESSION_SECRET),

  /** Origen publico del sitio; se usa para armar los links de invitacion. */
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),

  /** Solo aplica en desarrollo: en produccion la SPA y la API comparten origen. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Variables de entorno invalidas:\n${z.prettifyError(parsed.error)}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.SESSION_SECRET === DEV_SESSION_SECRET) {
      throw new Error('SESSION_SECRET debe definirse explicitamente en produccion.');
    }
    if (env.DATABASE_URL === LOCAL_DATABASE_URL) {
      throw new Error('DATABASE_URL debe apuntar a Neon en produccion.');
    }
  }
  return env;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Cadena para migraciones: la directa si existe, si no la normal (caso local). */
export const migrationDatabaseUrl = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
