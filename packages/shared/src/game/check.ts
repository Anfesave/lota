import { CARD_ROWS } from '../constants.js';
import { cardNumbers } from './card.js';
import type { Card } from './types.js';

/**
 * Indice de la primera fila completamente cantada, o null si no hay ninguna.
 * El servidor lo usa para validar un claim de LINEA y el cliente para
 * resaltarla.
 */
export function findCompletedLine(card: Card, drawn: ReadonlySet<number>): number | null {
  for (let fila = 0; fila < CARD_ROWS; fila++) {
    const casillas = card[fila];
    if (!casillas) continue;

    const numeros = casillas.filter((casilla): casilla is number => casilla !== null);
    if (numeros.length > 0 && numeros.every((numero) => drawn.has(numero))) return fila;
  }
  return null;
}

/** True si alguna fila del carton esta completa. */
export function checkLine(card: Card, drawn: ReadonlySet<number>): boolean {
  return findCompletedLine(card, drawn) !== null;
}

/** True si los 15 numeros del carton ya salieron: lota. */
export function checkFull(card: Card, drawn: ReadonlySet<number>): boolean {
  return cardNumbers(card).every((numero) => drawn.has(numero));
}
