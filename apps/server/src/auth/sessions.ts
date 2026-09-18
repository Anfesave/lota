import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { SESSION_DURATION_MS } from './constants.js';

/** Token de 32 bytes: 256 bits de entropia, imposible de adivinar. */
function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * En la BD solo guardamos el SHA-256 del token. Si alguien se lleva la tabla
 * `sessions`, no puede suplantar a nadie. No hace falta salt ni un hash lento:
 * el token ya es aleatorio y de alta entropia.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<NewSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await getDb()
    .insert(sessions)
    .values({ id: hashSessionToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** Devuelve el usuario dueno del token, o undefined si no existe o vencio. */
export async function findUserBySessionToken(token: string): Promise<UserRow | undefined> {
  const filas = await getDb()
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return filas[0]?.user;
}

export async function revokeSession(token: string): Promise<void> {
  await getDb()
    .delete(sessions)
    .where(eq(sessions.id, hashSessionToken(token)));
}

/** Limpieza de sesiones vencidas. Devuelve cuantas borro. */
export async function deleteExpiredSessions(): Promise<number> {
  const borradas = await getDb()
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return borradas.length;
}
