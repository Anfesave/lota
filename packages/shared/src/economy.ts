/**
 * Monedas virtuales y apuestas. Todo ajustable desde aquí: son números de
 * balance de juego, no constantes técnicas.
 */

/** Cartón lleno. Fijo: no depende de cuánta gente haya en la sala. */
export const COINS_FULL_CARD = 50;

/** Por terminar la partida, se gane o no. */
export const COINS_PARTICIPATION = 10;

/** Línea (solo en modo LINEA_Y_CARTON); se suma a lo anterior. */
export const COINS_LINE = 15;

/** Bono por el primer inicio de sesión de cada día. */
export const COINS_DAILY_BONUS = 10;

/** Tope de monedas ganadas en partidas por usuario y día (anti-farmeo). */
export const DAILY_COINS_CAP = 500;

/**
 * Monedas que le tocan a un jugador al terminar la partida.
 *
 * Ganar el cartón paga 50 **en vez** de los 10 de participación, no además:
 * son premios excluyentes. La línea sí se suma, porque se gana antes y sin
 * terminar la partida.
 */
export function coinsForPlayer({
  ganoCarton,
  ganoLinea,
}: {
  ganoCarton: boolean;
  ganoLinea: boolean;
}): number {
  const base = ganoCarton ? COINS_FULL_CARD : COINS_PARTICIPATION;
  return base + (ganoLinea ? COINS_LINE : 0);
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

/**
 * Formatea un monto en pesos chilenos: 1500 -> "$1.500".
 * El signo va delante del peso, no detrás: "-$2.000", no "$-2.000".
 */
export function formatPesos(monto: number): string {
  const signo = monto < 0 ? '-' : '';
  return `${signo}$${Math.abs(monto).toLocaleString('es-CL')}`;
}

// --- Aviso de que alguien está por ganar -----------------------------------

/**
 * Cuántos números le pueden faltar a alguien para que se avise a la sala.
 * De mayor a menor: así el aviso se dispara una sola vez por escalón.
 */
export const CLOSE_TO_WIN_THRESHOLDS = [3, 2, 1] as const;
