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
