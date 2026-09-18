import {
  CARD_COLUMNS,
  CARD_ROWS,
  MAX_NUMBER,
  MIN_NUMBER,
  NUMBERS_PER_CARD,
  NUMBERS_PER_ROW,
} from '../constants.js';
import { shuffle, type RandomInt } from './random.js';
import type { Card, Cell } from './types.js';

/**
 * Rango de numeros de cada columna. La primera va de 1 a 9 (no hay 0) y la
 * ultima de 80 a 90 (se lleva el 90): 9 + 7*10 + 11 = 90 numeros en total.
 */
export function columnRange(column: number): { min: number; max: number } {
  if (!Number.isInteger(column) || column < 0 || column >= CARD_COLUMNS) {
    throw new RangeError(`columna fuera de rango: ${column}`);
  }
  if (column === 0) return { min: MIN_NUMBER, max: 9 };
  if (column === CARD_COLUMNS - 1) return { min: 80, max: MAX_NUMBER };
  return { min: column * 10, max: column * 10 + 9 };
}

/** A que columna pertenece un numero del bolillero. */
export function columnOf(value: number): number {
  if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
    throw new RangeError(`numero fuera del bolillero: ${value}`);
  }
  return Math.min(Math.floor(value / 10), CARD_COLUMNS - 1);
}

/** Todas las formas de elegir `k` filas distintas de `n`, en orden ascendente. */
function combinations(n: number, k: number): number[][] {
  const salida: number[][] = [];
  const actual: number[] = [];

  const recorrer = (desde: number): void => {
    if (actual.length === k) {
      salida.push([...actual]);
      return;
    }
    for (let i = desde; i < n; i++) {
      actual.push(i);
      recorrer(i + 1);
      actual.pop();
    }
  };

  recorrer(0);
  return salida;
}

/**
 * Cuantos numeros lleva cada columna. Cada una tiene al menos 1 y como mucho 3
 * (una por fila); repartimos los 6 restantes al azar hasta llegar a 15.
 */
function chooseColumnCounts(randomInt: RandomInt): number[] {
  const counts = new Array<number>(CARD_COLUMNS).fill(1);
  let restantes = NUMBERS_PER_CARD - CARD_COLUMNS;

  // Siempre queda alguna columna con hueco, porque 15 < 9*3.
  while (restantes > 0) {
    const columna = randomInt(CARD_COLUMNS);
    if (counts[columna]! < CARD_ROWS) {
      counts[columna] = counts[columna]! + 1;
      restantes -= 1;
    }
  }
  return counts;
}

/**
 * Decide que filas ocupa cada columna, respetando que cada fila tenga
 * exactamente 5 numeros. Es un problema de reparto con restricciones: se
 * resuelve con vuelta atras, que aqui es trivial (9 columnas, 3 opciones cada
 * una). El orden aleatorio de columnas evita que se llenen siempre las mismas
 * filas primero.
 */
function assignRows(counts: readonly number[], randomInt: RandomInt): boolean[][] {
  const ocupada: boolean[][] = Array.from({ length: CARD_ROWS }, () =>
    new Array<boolean>(CARD_COLUMNS).fill(false),
  );
  const capacidad = new Array<number>(CARD_ROWS).fill(NUMBERS_PER_ROW);
  const orden = shuffle([...counts.keys()], randomInt);

  const colocar = (indice: number): boolean => {
    if (indice === orden.length) return true;

    const columna = orden[indice]!;
    const cuantos = counts[columna]!;

    for (const filas of shuffle(combinations(CARD_ROWS, cuantos), randomInt)) {
      if (filas.some((fila) => capacidad[fila]! === 0)) continue;

      for (const fila of filas) capacidad[fila] = capacidad[fila]! - 1;
      if (colocar(indice + 1)) {
        for (const fila of filas) ocupada[fila]![columna] = true;
        return true;
      }
      for (const fila of filas) capacidad[fila] = capacidad[fila]! + 1;
    }
    return false;
  };

  if (!colocar(0)) {
    throw new Error(`no se pudo repartir las columnas [${counts.join(',')}] en las filas`);
  }
  return ocupada;
}

/** Genera un carton valido: 3x9, 15 numeros, 5 por fila, columnas ordenadas. */
export function generateCard(randomInt: RandomInt): Card {
  const counts = chooseColumnCounts(randomInt);
  const ocupada = assignRows(counts, randomInt);

  const carton: Card = Array.from({ length: CARD_ROWS }, () =>
    new Array<Cell>(CARD_COLUMNS).fill(null),
  );

  for (let columna = 0; columna < CARD_COLUMNS; columna++) {
    const { min, max } = columnRange(columna);
    const disponibles: number[] = [];
    for (let valor = min; valor <= max; valor++) disponibles.push(valor);

    // De menor a mayor: dentro de una columna el carton se lee hacia abajo.
    const elegidos = shuffle(disponibles, randomInt)
      .slice(0, counts[columna]!)
      .sort((a, b) => a - b);

    const filas: number[] = [];
    for (let fila = 0; fila < CARD_ROWS; fila++) {
      if (ocupada[fila]![columna]) filas.push(fila);
    }

    filas.forEach((fila, posicion) => {
      carton[fila]![columna] = elegidos[posicion]!;
    });
  }

  return carton;
}

/** Los 15 numeros del carton, de menor a mayor. */
export function cardNumbers(card: Card): number[] {
  const numeros: number[] = [];
  for (const fila of card) {
    for (const casilla of fila) {
      if (casilla !== null) numeros.push(casilla);
    }
  }
  return numeros.sort((a, b) => a - b);
}

/**
 * Clave de identidad de un carton. Dos cartones con los mismos 15 numeros se
 * juegan igual aunque esten distribuidos distinto, asi que cuentan como
 * repetidos.
 */
export function cardKey(card: Card): string {
  return cardNumbers(card).join(',');
}

/** Tope de reintentos antes de rendirse; con 90 numeros un choque es rarisimo. */
const MAX_INTENTOS_POR_CARTON = 100;

/**
 * Genera `count` cartones distintos entre si. `usados` permite ademas evitar
 * los cartones que ya tienen otros jugadores de la sala (PLAN.md seccion 3).
 */
export function generateUniqueCards(
  count: number,
  randomInt: RandomInt,
  usados: ReadonlySet<string> = new Set(),
): Card[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count debe ser un entero no negativo, llego ${count}`);
  }

  const claves = new Set(usados);
  const cartones: Card[] = [];

  while (cartones.length < count) {
    let elegido: Card | undefined;

    for (let intento = 0; intento < MAX_INTENTOS_POR_CARTON; intento++) {
      const candidato = generateCard(randomInt);
      const clave = cardKey(candidato);
      if (!claves.has(clave)) {
        claves.add(clave);
        elegido = candidato;
        break;
      }
    }

    if (!elegido) {
      throw new Error(
        `no se logro generar un carton distinto en ${MAX_INTENTOS_POR_CARTON} intentos`,
      );
    }
    cartones.push(elegido);
  }

  return cartones;
}
