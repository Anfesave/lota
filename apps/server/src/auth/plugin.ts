import fastifyCookie from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { UserRow } from '../db/schema.js';
import { env, isProduction } from '../env.js';
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from './constants.js';
import { findUserBySessionToken } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario de la sesion, o null si la peticion es anonima. */
    user: UserRow | null;
  }
  interface FastifyInstance {
    /** preHandler que corta con 401 si no hay sesion valida. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Opciones de la cookie de sesion. `secure` solo en produccion (Render da HTTPS). */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    signed: true,
  };
}

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie, { secret: env.SESSION_SECRET });

  app.decorateRequest('user', null);

  /**
   * Resuelve la sesion en cada peticion. No falla si no hay cookie: las rutas
   * publicas siguen funcionando y son ellas las que exigen sesion.
   */
  app.addHook('onRequest', async (request) => {
    const crudo = request.cookies[SESSION_COOKIE_NAME];
    if (!crudo) return;

    // La firma deja fuera cookies manipuladas sin tocar la base de datos,
    // algo que importa con Neon dormido en el plan Free.
    const { valid, value } = request.unsignCookie(crudo);
    if (!valid || !value) return;

    request.user = (await findUserBySessionToken(value)) ?? null;
  });

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      await reply.status(401).send({ code: 'NO_AUTENTICADO', message: 'Inicia sesion primero.' });
    }
  });
};

/** fastify-plugin evita que los decoradores queden encapsulados en este plugin. */
export default fp(authPlugin, { name: 'auth' });

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
}

export function readSessionToken(request: FastifyRequest): string | undefined {
  const crudo = request.cookies[SESSION_COOKIE_NAME];
  if (!crudo) return undefined;
  const { valid, value } = request.unsignCookie(crudo);
  return valid && value ? value : undefined;
}
