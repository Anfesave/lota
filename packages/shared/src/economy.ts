/**
 * Monedas virtuales y apuestas. Todo ajustable desde aquí: son números de
 * balance de juego, no constantes técnicas.
 */

/** Cartón lleno: base más un extra por cada rival. */
export const COINS_FULL_CARD_BASE = 50;
export const COINS_PER_EXTRA_PLAYER = 10;

/** Línea (solo en modo LINEA_Y_CARTON). */
export const COINS_LINE = 15;

/** Bono por el primer inicio de sesión de cada día. */
export const COINS_DAILY_BONUS = 10;

/** Tope de monedas ganadas en partidas por usuario y día (anti-farmeo). */
export const DAILY_COINS_CAP = 500;

/** Monedas que reparte un cartón lleno con `jugadores` en la sala. */
export function coinsForFullCard(jugadores: number): number {
  return COINS_FULL_CARD_BASE + COINS_PER_EXTRA_PLAYER * Math.max(0, jugadores - 1);
}

/**
 * Reparte un premio entre los que empataron, redondeando hacia arriba
 * (PLAN.md sección 3). Con 3 ganadores y 50 monedas, cada uno se lleva 17.
 */
export function splitPrize(total: number, ganadores: number): number {
  if (ganadores <= 0) return 0;
  return Math.ceil(total / ganadores);
}

// --- Apuestas entre amigos -------------------------------------------------

/**
 * Las apuestas son un **registro**, no dinero de verdad: la aplicación anota
 * cuánto puso cada quien y quién se llevó el pozo, y el arreglo queda entre
 * los jugadores. No hay pasarela de pago ni saldo real en ninguna parte, y no
 * tienen nada que ver con las monedas virtuales de la tienda.
 */
export const BET_STEP = 500;
export const MIN_BET = 0;
export const MAX_BET = 100_000;

/** Un monto de apuesta válido: 0 o múltiplo de 500 dentro del tope. */
export function isValidBet(monto: number): boolean {
  return Number.isInteger(monto) && monto >= MIN_BET && monto <= MAX_BET && monto % BET_STEP === 0;
}

/** Formatea un monto en pesos chilenos: 1500 -> "$1.500". */
export function formatPesos(monto: number): string {
  return `$${monto.toLocaleString('es-CL')}`;
}

// --- Aviso de que alguien está por ganar -----------------------------------

/**
 * Cuántos números le pueden faltar a alguien para que se avise a la sala.
 * De mayor a menor: así el aviso se dispara una sola vez por escalón.
 */
export const CLOSE_TO_WIN_THRESHOLDS = [3, 2, 1] as const;
