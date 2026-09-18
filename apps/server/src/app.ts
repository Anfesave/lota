import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { pingDb } from './db/index.js';
import { env, isProduction, isTest } from './env.js';

/**
 * En produccion el mismo proceso sirve la SPA compilada y la API, para que todo
 * comparta origen (sin CORS y con cookies que funcionan). Vale tanto desde
 * `dist/app.js` como desde `src/app.ts` en dev: en ambos casos son dos niveles
 * arriba de `apps/server`.
 */
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

/** Construye la instancia de Fastify sin ponerla a escuchar (facilita los tests). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isTest
      ? false
      : isProduction
        ? { level: 'info' }
        : { level: 'debug', transport: { target: 'pino-pretty' } },
    // Render termina el HTTPS en su proxy: sin esto las cookies `secure` y el
    // rate limit por IP no funcionan. En local no hay proxy en que confiar.
    trustProxy: isProduction,
  });

  // Render llama a /health con frecuencia y Neon puede estar dormido:
  // esta ruta NO toca la base de datos a proposito.
  app.get('/health', async () => ({
    status: 'ok',
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime()),
  }));

  // Diagnostico manual. Render no la usa.
  app.get('/health/db', async (_request, reply) => {
    const inicio = Date.now();
    try {
      await pingDb();
      return { status: 'ok', latencyMs: Date.now() - inicio };
    } catch (error) {
      app.log.error(error, 'fallo el ping a la base de datos');
      return reply.status(503).send({ status: 'error', latencyMs: Date.now() - inicio });
    }
  });

  await registerSpa(app);

  return app;
}

/** Sirve apps/web/dist con fallback a index.html para las rutas del router. */
async function registerSpa(app: FastifyInstance): Promise<void> {
  if (!isProduction) return;

  if (!existsSync(join(WEB_DIST, 'index.html'))) {
    app.log.warn({ WEB_DIST }, 'no se encontro el build de la SPA; se sirve solo la API');
    return;
  }

  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    // Las rutas de API y socket que no existen deben seguir siendo 404 de verdad.
    if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Recurso no encontrado' });
    }
    return reply.sendFile('index.html');
  });
}
