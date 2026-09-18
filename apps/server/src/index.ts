import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

/** Apagado ordenado: dejar de aceptar conexiones antes de morir. */
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    app.log.info({ senal }, 'apagando servidor');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
