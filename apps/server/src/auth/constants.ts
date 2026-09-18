/** Constantes de sesion y de limites de intentos. */

export const SESSION_COOKIE_NAME = 'lota_sesion';

/** Duracion de una sesion: 30 dias. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Cada cuanto se borran las sesiones vencidas (ver PLAN.md 12.3: nunca mas seguido). */
export const SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Rate limit de login y registro: 5 intentos por minuto por IP + usuario. */
export const AUTH_RATE_LIMIT_MAX = 5;
export const AUTH_RATE_LIMIT_WINDOW = '1 minute';
