/** Constantes del juego. Nunca repetir estos numeros en otros paquetes. */

/** Rango del bolillero de la lota chilena: 1 a 90. */
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 90;
export const TOTAL_NUMBERS = MAX_NUMBER - MIN_NUMBER + 1;

/** Geometria del carton: 3 filas x 9 columnas, 5 numeros por fila. */
export const CARD_ROWS = 3;
export const CARD_COLUMNS = 9;
export const NUMBERS_PER_ROW = 5;
export const NUMBERS_PER_CARD = CARD_ROWS * NUMBERS_PER_ROW;

/** Limites de sala. */
export const MAX_PLAYERS = 10;
export const MIN_CARDS_PER_PLAYER = 1;
export const MAX_CARDS_PER_PLAYER = 4;

/** Codigo de invitacion: 6 caracteres sin ambiguos (sin 0/O, 1/I/L). */
export const LOBBY_CODE_LENGTH = 6;
export const LOBBY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Velocidades del locutor, en milisegundos entre numeros. */
export const CALL_INTERVALS_MS = [3000, 5000, 8000, 12000] as const;

/** Bloqueo tras cantar una lota invalida. */
export const INVALID_CLAIM_BLOCK_MS = 10_000;

/** Cuenta regresiva antes de repartir cartones. */
export const COUNTDOWN_SECONDS = 5;

/** Limites de texto. */
export const MAX_VICTORY_MESSAGE_LENGTH = 140;
export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Nombre de una sala. */
export const LOBBY_NAME_MIN_LENGTH = 3;
export const LOBBY_NAME_MAX_LENGTH = 40;

/** Contrasena de una sala privada: se comparte por chat, no hace falta que sea larga. */
export const LOBBY_PASSWORD_MIN_LENGTH = 4;
export const LOBBY_PASSWORD_MAX_LENGTH = 72;

/** Una sala sin nadie dentro se elimina tras 2 minutos. */
export const LOBBY_EMPTY_TTL_MS = 2 * 60 * 1000;

/**
 * Margen que se le da a un jugador desconectado en WAITING antes de sacarlo.
 * Si era el anfitrion, el rol pasa al jugador mas antiguo que quede.
 */
export const DISCONNECT_GRACE_MS = 30 * 1000;

/** Cada cuanto se revisan las salas para limpiar desconectados y vacias. */
export const LOBBY_SWEEP_INTERVAL_MS = 5 * 1000;

/** Chat: como mucho un mensaje por segundo y por jugador. */
export const CHAT_RATE_LIMIT_MS = 1000;

/** Cuantos mensajes de chat recientes guarda una sala. */
export const CHAT_HISTORY_SIZE = 50;
