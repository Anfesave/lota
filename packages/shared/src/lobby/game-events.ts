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
  /** Monedas ganadas. Siempre 0 hasta la Fase 6. */
  coinsWon: number;
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
  /** Por que termino: alguien canto lota o se acabo la bolsa. */
  reason: 'LOTA' | 'BOLSA_VACIA' | 'CANCELADA';
}
