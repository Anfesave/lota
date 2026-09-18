import { loginSchema, registerSchema } from '@lota/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW } from '../auth/constants.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../auth/plugin.js';
import { createSession, revokeSession } from '../auth/sessions.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { toCurrentUser } from './me.js';

/** Codigo de violacion de restriccion unica en Postgres. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Drizzle envuelve los errores de pg en un DrizzleQueryError, asi que el codigo
 * viene en `cause` y no en la raiz. Recorremos la cadena por si se anida mas.
 */
function esViolacionDeUnicidad(error: unknown): boolean {
  let actual: unknown = error;
  for (let profundidad = 0; actual && profundidad < 5; profundidad++) {
    if (
      typeof actual === 'object' &&
      'code' in actual &&
      (actual as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    actual = (actual as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Limita por IP **y** usuario: asi un atacante no puede agotar los intentos de
 * una victima desde otra IP, ni probar muchos usuarios desde la suya.
 */
function claveRateLimit(request: FastifyRequest): string {
  const cuerpo = request.body as { username?: unknown } | undefined;
  const usuario = typeof cuerpo?.username === 'string' ? cuerpo.username.toLowerCase() : '';
  return `${request.ip}:${usuario}`;
}

const rateLimitAuth = {
  rateLimit: {
    max: AUTH_RATE_LIMIT_MAX,
    timeWindow: AUTH_RATE_LIMIT_WINDOW,
    keyGenerator: claveRateLimit,
  },
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', { config: rateLimitAuth }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'DATOS_INVALIDOS',
        message: parsed.error.issues[0]?.message ?? 'Datos invalidos.',
      });
    }

    const { username, password, victoryMessage } = parsed.data;
    const passwordHash = await hashPassword(password);

    try {
      const [creado] = await getDb()
        .insert(users)
        .values({ username, passwordHash, victoryMessage })
        .returning();

      const { token } = await createSession(creado!.id);
      setSessionCookie(reply, token);
      return reply.status(201).send(toCurrentUser(creado!));
    } catch (error) {
      // `username` es citext: la unicidad ya ignora mayusculas. Dos registros
      // simultaneos con el mismo nombre llegan aqui en vez de crear duplicados.
      if (esViolacionDeUnicidad(error)) {
        return reply
          .status(409)
          .send({ code: 'USUARIO_EXISTE', message: 'Ese nombre de usuario ya esta tomado.' });
      }
      throw error;
    }
  });

  app.post('/auth/login', { config: rateLimitAuth }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    // Mensaje generico a proposito: no revelamos si el usuario existe.
    const credencialesInvalidas = () =>
      reply
        .status(401)
        .send({ code: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contrasena incorrectos.' });

    if (!parsed.success) return credencialesInvalidas();

    const [usuario] = await getDb()
      .select()
      .from(users)
      .where(eq(users.username, parsed.data.username))
      .limit(1);

    if (!usuario) {
      // Hasheamos igual aunque no exista, para que el tiempo de respuesta no
      // delate que usuarios estan registrados.
      await hashPassword(parsed.data.password);
      return credencialesInvalidas();
    }

    if (!(await verifyPassword(usuario.passwordHash, parsed.data.password))) {
      return credencialesInvalidas();
    }

    const { token } = await createSession(usuario.id);
    setSessionCookie(reply, token);
    return toCurrentUser(usuario);
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = readSessionToken(request);
    if (token) await revokeSession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });
};
