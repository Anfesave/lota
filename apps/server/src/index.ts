import { buildApp } from './app.js';
import { SESSION_CLEANUP_INTERVAL_MS } from './auth/constants.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { seedCosmetics } from './economy/cosmetics.js';
import { env } from './env.js';

const app = await buildApp();

/**
 * Limpieza de sesiones vencidas: al arrancar y una vez al dia. Mas seguido
 * gastaria horas de computo del plan Free de Neon sin ganar nada.
 */
async function limpiarSesiones(): Promise<void> {
  try {
    const borradas = await deleteExpiredSessions();
    if (borradas > 0) app.log.info({ borradas }, 'sesiones vencidas eliminadas');
  } catch (error) {
    app.log.error(error, 'fallo la limpieza de sesiones');
  }
}

const temporizadorLimpieza = setInterval(limpiarSesiones, SESSION_CLEANUP_INTERVAL_MS);
// No mantener vivo el proceso solo por este temporizador.
temporizadorLimpieza.unref();

/** Apagado ordenado: dejar de aceptar conexiones antes de morir. */
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    app.log.info({ senal }, 'apagando servidor');
    clearInterval(temporizadorLimpieza);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  void limpiarSesiones();

  // Los cosmeticos de salida se insertan o actualizan en cada arranque.
  seedCosmetics().catch((error: unknown) =>
    app.log.error(error, 'no se pudieron sembrar los cosmeticos'),
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
