import { beforeAll, describe, expect, it } from 'vitest';
import {
  CARD_COLUMNS,
  CARD_ROWS,
  MAX_NUMBER,
  MIN_NUMBER,
  NUMBERS_PER_CARD,
  NUMBERS_PER_ROW,
} from '../constants.js';
import {
  cardKey,
  cardNumbers,
  columnOf,
  columnRange,
  generateCard,
  generateUniqueCards,
} from './card.js';
import { createSeededRandomInt } from './random.js';
import type { Card } from './types.js';

/**
 * El plan (Fase 2) pide comprobar las invariantes sobre 10.000 cartones. Se
 * generan con una semilla fija: el barrido es amplio pero cualquier fallo se
 * puede reproducir.
 *
 * Los recorridos acumulan los incumplimientos en una lista y hacen un solo
 * `expect` al final. Con un `expect` por casilla serian ~270.000 llamadas y el
 * archivo tardaria diez segundos en vez de uno.
 */
const CARTONES_A_PROBAR = 10_000;
const cartones: Card[] = [];
const RANGOS = Array.from({ length: CARD_COLUMNS }, (_, columna) => columnRange(columna));

beforeAll(() => {
  const randomInt = createSeededRandomInt(20260918);
  for (let i = 0; i < CARTONES_A_PROBAR; i++) cartones.push(generateCard(randomInt));
});

describe('columnRange', () => {
  it('reparte los 90 numeros sin huecos ni solapes', () => {
    const vistos = new Set<number>();
    for (const { min, max } of RANGOS) {
      for (let valor = min; valor <= max; valor++) {
        expect(vistos.has(valor)).toBe(false);
        vistos.add(valor);
      }
    }
    expect(vistos.size).toBe(MAX_NUMBER);
    expect(Math.min(...vistos)).toBe(MIN_NUMBER);
    expect(Math.max(...vistos)).toBe(MAX_NUMBER);
  });

  it('la primera columna va de 1 a 9 y la ultima de 80 a 90', () => {
    expect(columnRange(0)).toEqual({ min: 1, max: 9 });
    expect(columnRange(1)).toEqual({ min: 10, max: 19 });
    expect(columnRange(7)).toEqual({ min: 70, max: 79 });
    expect(columnRange(8)).toEqual({ min: 80, max: 90 });
  });

  it('rechaza columnas fuera de rango', () => {
    expect(() => columnRange(-1)).toThrow(RangeError);
    expect(() => columnRange(CARD_COLUMNS)).toThrow(RangeError);
  });

  it('columnOf es coherente con columnRange', () => {
    const fallos: string[] = [];
    for (let valor = MIN_NUMBER; valor <= MAX_NUMBER; valor++) {
      const { min, max } = RANGOS[columnOf(valor)]!;
      if (valor < min || valor > max) fallos.push(`${valor} cayo en la columna ${min}-${max}`);
    }
    expect(fallos).toEqual([]);
    expect(() => columnOf(0)).toThrow(RangeError);
    expect(() => columnOf(91)).toThrow(RangeError);
  });
});

describe(`invariantes del carton sobre ${CARTONES_A_PROBAR} cartones`, () => {
  it('tienen la forma 3x9', () => {
    const fallos: string[] = [];
    cartones.forEach((carton, indice) => {
      if (carton.length !== CARD_ROWS) fallos.push(`carton ${indice}: ${carton.length} filas`);
      carton.forEach((fila, numeroFila) => {
        if (fila.length !== CARD_COLUMNS) {
          fallos.push(`carton ${indice} fila ${numeroFila}: ${fila.length} columnas`);
        }
      });
    });
    expect(fallos).toEqual([]);
  });

  it('tienen 15 numeros, 5 por fila', () => {
    const fallos: string[] = [];
    cartones.forEach((carton, indice) => {
      const total = cardNumbers(carton).length;
      if (total !== NUMBERS_PER_CARD) fallos.push(`carton ${indice}: ${total} numeros`);

      carton.forEach((fila, numeroFila) => {
        const cuantos = fila.filter((casilla) => casilla !== null).length;
        if (cuantos !== NUMBERS_PER_ROW) {
          fallos.push(`carton ${indice} fila ${numeroFila}: ${cuantos} numeros`);
        }
      });
    });
    expect(fallos).toEqual([]);
  });

  it('cada numero cae en el rango de su columna', () => {
    const fallos: string[] = [];
    cartones.forEach((carton, indice) => {
      for (let fila = 0; fila < CARD_ROWS; fila++) {
        for (let columna = 0; columna < CARD_COLUMNS; columna++) {
          const casilla = carton[fila]![columna];
          if (casilla === null || casilla === undefined) continue;

          const { min, max } = RANGOS[columna]!;
          if (casilla < min || casilla > max) {
            fallos.push(
              `carton ${indice} [${fila}][${columna}] = ${casilla}, esperaba ${min}-${max}`,
            );
          }
        }
      }
    });
    expect(fallos).toEqual([]);
  });

  it('cada columna tiene entre 1 y 3 numeros, en orden ascendente hacia abajo', () => {
    const fallos: string[] = [];
    cartones.forEach((carton, indice) => {
      for (let columna = 0; columna < CARD_COLUMNS; columna++) {
        const enColumna: number[] = [];
        for (let fila = 0; fila < CARD_ROWS; fila++) {
          const casilla = carton[fila]![columna];
          if (casilla !== null && casilla !== undefined) enColumna.push(casilla);
        }

        if (enColumna.length < 1 || enColumna.length > CARD_ROWS) {
          fallos.push(`carton ${indice} columna ${columna}: ${enColumna.length} numeros`);
        }
        for (let i = 1; i < enColumna.length; i++) {
          if (enColumna[i]! <= enColumna[i - 1]!) {
            fallos.push(`carton ${indice} columna ${columna}: ${enColumna.join('<')} sin orden`);
          }
        }
      }
    });
    expect(fallos).toEqual([]);
  });

  it('no repiten numeros dentro del mismo carton', () => {
    const fallos: string[] = [];
    cartones.forEach((carton, indice) => {
      const numeros = cardNumbers(carton);
      if (new Set(numeros).size !== numeros.length) {
        fallos.push(`carton ${indice}: ${numeros.join(',')}`);
      }
    });
    expect(fallos).toEqual([]);
  });

  it('el reparto no esta sesgado: toda columna llega alguna vez a 3 numeros', () => {
    const columnasCon3 = new Set<number>();
    for (const carton of cartones) {
      for (let columna = 0; columna < CARD_COLUMNS; columna++) {
        const llenas = [0, 1, 2].filter((fila) => carton[fila]![columna] !== null).length;
        if (llenas === CARD_ROWS) columnasCon3.add(columna);
      }
    }
    expect(columnasCon3.size).toBe(CARD_COLUMNS);
  });

  it('practicamente no se repiten entre si', () => {
    // El espacio de cartones es enorme; con 10.000 no deberia haber choques.
    expect(new Set(cartones.map(cardKey)).size).toBe(cartones.length);
  });
});

describe('generateCard', () => {
  it('es reproducible con la misma semilla', () => {
    expect(generateCard(createSeededRandomInt(7))).toEqual(generateCard(createSeededRandomInt(7)));
  });

  it('da cartones distintos con semillas distintas', () => {
    const uno = cardKey(generateCard(createSeededRandomInt(7)));
    const otro = cardKey(generateCard(createSeededRandomInt(8)));
    expect(uno).not.toBe(otro);
  });
});

describe('generateUniqueCards', () => {
  it('devuelve la cantidad pedida, todos distintos', () => {
    const cuatro = generateUniqueCards(4, createSeededRandomInt(99));

    expect(cuatro).toHaveLength(4);
    expect(new Set(cuatro.map(cardKey)).size).toBe(4);
  });

  it('respeta los cartones ya repartidos a otros jugadores', () => {
    const randomInt = createSeededRandomInt(123);
    const deOtroJugador = generateUniqueCards(2, randomInt);
    const usados = new Set(deOtroJugador.map(cardKey));

    const mios = generateUniqueCards(3, randomInt, usados);

    expect(mios).toHaveLength(3);
    for (const carton of mios) expect(usados.has(cardKey(carton))).toBe(false);
    expect(new Set([...deOtroJugador, ...mios].map(cardKey)).size).toBe(5);
  });

  it('no modifica el conjunto de usados que recibe', () => {
    const usados = new Set<string>();
    generateUniqueCards(2, createSeededRandomInt(4), usados);
    expect(usados.size).toBe(0);
  });

  it('acepta 0 y rechaza cantidades invalidas', () => {
    const randomInt = createSeededRandomInt(1);
    expect(generateUniqueCards(0, randomInt)).toEqual([]);
    expect(() => generateUniqueCards(-1, randomInt)).toThrow(RangeError);
    expect(() => generateUniqueCards(1.5, randomInt)).toThrow(RangeError);
  });
});
