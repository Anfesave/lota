import type { Card } from '../game/types.js';

/** Un numero cantado por el locutor. */
export interface NumberCalled {
  number: number;
  /** Posicion en el sorteo, empezando en 1. */
  index: number;
  calledAt: string;
}

export interface WinnerView {
  userId: string;
  username: string;
  victoryMessage: string;
  equipped: Record<string, string>;
  /** Carton con el que gano, para mostrarlo en la pantalla de victoria. */
  card: Card;
  /** Monedas virtuales ganadas. */
  coinsWon: number;
  /** Pozo de apuestas que se llevo, en pesos. 0 si la sala no apostaba. */
  potWon: number;
}

/** Aviso a la sala de que a alguien le faltan pocos numeros para la lota. */
export interface PlayerCloseToWin {
  userId: string;
  username: string;
  /** Cuantos numeros le faltan: 3, 2 o 1. */
  remaining: number;
}

export type ClaimType = 'LINE' | 'FULL';

export interface ClaimRejected {
  type: ClaimType;
  reason: string;
  /** Marca de tiempo hasta la que no puede volver a cantar. */
  blockedUntil: number;
}

export interface GameFinished {
  winners: WinnerView[];
  drawn: number[];
  /**
   * Monedas que se llevo cada jugador, por id. Incluye a los que no ganaron:
   * participar tambien paga, y cada uno tiene que poder ver lo suyo.
   */
  coinsByUser: Record<string, number>;
  /** Por que termino: alguien canto lota o se acabo la bolsa. */
  reason: 'LOTA' | 'BOLSA_VACIA' | 'CANCELADA';
}
