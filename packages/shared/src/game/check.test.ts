import { describe, expect, it } from 'vitest';
import { MAX_NUMBER, MIN_NUMBER } from '../constants.js';
import { createBag } from './bag.js';
import { cardNumbers, generateCard } from './card.js';
import { checkFull, checkLine, findCompletedLine } from './check.js';
import { createSeededRandomInt } from './random.js';
import type { Card } from './types.js';

/** Carton escrito a mano para que las filas sean evidentes en los asserts. */
const CARTON: Card = [
  [1, null, 20, null, 40, null, 60, null, 80],
  [null, 11, null, 30, null, 50, null, 70, 81],
  [2, 12, 21, null, 41, null, null, null, null],
];

const FILA_0 = [1, 20, 40, 60, 80];
const FILA_1 = [11, 30, 50, 70, 81];
const FILA_2 = [2, 12, 21, 41];

describe('findCompletedLine', () => {
  it('devuelve null si no hay ninguna fila completa', () => {
    expect(findCompletedLine(CARTON, new Set([1, 20, 40, 60]))).toBeNull();
  });

  it('encuentra la fila completa', () => {
    expect(findCompletedLine(CARTON, new Set(FILA_0))).toBe(0);
    expect(findCompletedLine(CARTON, new Set(FILA_1))).toBe(1);
  });

  it('no se conforma con que falte un solo numero', () => {
    const casiFila0 = new Set(FILA_0.slice(0, -1));
    expect(findCompletedLine(CARTON, casiFila0)).toBeNull();
  });

  it('devuelve la primera fila completa cuando hay varias', () => {
    expect(findCompletedLine(CARTON, new Set([...FILA_0, ...FILA_1]))).toBe(0);
  });

  it('los huecos no cuentan como numeros pendientes', () => {
    // La fila 2 tiene 4 numeros y 5 huecos en este carton de prueba.
    expect(findCompletedLine(CARTON, new Set(FILA_2))).toBe(2);
  });
});

describe('checkLine', () => {
  it('es true solo cuando hay una fila completa', () => {
    expect(checkLine(CARTON, new Set())).toBe(false);
    expect(checkLine(CARTON, new Set(FILA_0))).toBe(true);
  });
});

describe('checkFull', () => {
  it('es false mientras falte cualquier numero', () => {
    const numeros = cardNumbers(CARTON);
    const menosUno = new Set(numeros.slice(1));
    expect(checkFull(CARTON, menosUno)).toBe(false);
  });

  it('es true cuando salieron los 15 numeros', () => {
    expect(checkFull(CARTON, new Set(cardNumbers(CARTON)))).toBe(true);
  });

  it('numeros de sobra no estorban', () => {
    const todos = new Set<number>();
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) todos.add(n);
    expect(checkFull(CARTON, todos)).toBe(true);
  });
});

describe('recorrido completo de una partida', () => {
  it('un carton se completa vaciando el bolillero, y la linea llega antes', () => {
    const randomInt = createSeededRandomInt(2026);
    const carton = generateCard(randomInt);
    const bolsa = createBag(randomInt);

    const salidos = new Set<number>();
    let cuandoLinea: number | null = null;
    let cuandoLota: number | null = null;

    for (let turno = 1; bolsa.length > 0; turno++) {
      salidos.add(bolsa.pop()!);
      if (cuandoLinea === null && checkLine(carton, salidos)) cuandoLinea = turno;
      if (checkFull(carton, salidos)) {
        cuandoLota = turno;
        break;
      }
    }

    expect(cuandoLinea).not.toBeNull();
    expect(cuandoLota).not.toBeNull();
    // Nunca se puede cantar lota antes que linea: la lota incluye una fila.
    expect(cuandoLinea!).toBeLessThanOrEqual(cuandoLota!);
    // Con 15 numeros repartidos en 90, la lota no puede caer antes del turno 15.
    expect(cuandoLota!).toBeGreaterThanOrEqual(15);
  });
});

describe('createBag', () => {
  it('trae los 90 numeros, una sola vez cada uno', () => {
    const bolsa = createBag(createSeededRandomInt(5));

    expect(bolsa).toHaveLength(MAX_NUMBER);
    expect(new Set(bolsa).size).toBe(MAX_NUMBER);
    expect([...bolsa].sort((a, b) => a - b)[0]).toBe(MIN_NUMBER);
    expect([...bolsa].sort((a, b) => a - b).at(-1)).toBe(MAX_NUMBER);
  });

  it('viene barajado, no en orden', () => {
    const bolsa = createBag(createSeededRandomInt(5));
    const ordenada = [...bolsa].sort((a, b) => a - b);
    expect(bolsa).not.toEqual(ordenada);
  });

  it('es reproducible con la misma semilla y distinta con otra', () => {
    expect(createBag(createSeededRandomInt(5))).toEqual(createBag(createSeededRandomInt(5)));
    expect(createBag(createSeededRandomInt(5))).not.toEqual(createBag(createSeededRandomInt(6)));
  });
});
