import { MAX_NUMBER, MIN_NUMBER } from '../constants.js';
import { shuffle, type RandomInt } from './random.js';

/**
 * Bolillero completo de 1 a 90, ya barajado. El locutor saca por el final con
 * `pop()`, que es O(1) y deja el resto intacto.
 */
export function createBag(randomInt: RandomInt): number[] {
  const numeros: number[] = [];
  for (let valor = MIN_NUMBER; valor <= MAX_NUMBER; valor++) numeros.push(valor);
  return shuffle(numeros, randomInt);
}
