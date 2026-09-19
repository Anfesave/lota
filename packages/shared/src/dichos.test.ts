import { describe, expect, it } from 'vitest';
import { DICHOS, dichoPara } from './dichos.js';
import { createSeededRandomInt } from './game/random.js';

describe('dichos de la lota', () => {
  it('el 11 siempre sale con el suyo', () => {
    // Pedido expresamente: es el unico dicho del 11, asi que no hay sorteo.
    expect(DICHOS[11]).toEqual(['Chúpalo entonces']);

    const randomInt = createSeededRandomInt(1);
    for (let i = 0; i < 20; i++) {
      expect(dichoPara(11, randomInt)).toBe('Chúpalo entonces');
    }
  });

  it('un numero sin dicho no inventa nada', () => {
    expect(dichoPara(4, createSeededRandomInt(1))).toBeUndefined();
  });

  it('cuando hay varios elige uno de la lista', () => {
    const randomInt = createSeededRandomInt(3);
    const salidas = new Set<string>();
    for (let i = 0; i < 50; i++) salidas.add(dichoPara(1, randomInt)!);

    for (const salida of salidas) expect(DICHOS[1]).toContain(salida);
  });
});
