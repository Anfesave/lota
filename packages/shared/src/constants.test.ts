import { describe, expect, it } from 'vitest';
import {
  CARD_COLUMNS,
  CARD_ROWS,
  LOBBY_CODE_ALPHABET,
  MAX_NUMBER,
  MIN_NUMBER,
  NUMBERS_PER_CARD,
  NUMBERS_PER_ROW,
  TOTAL_NUMBERS,
} from './constants.js';

describe('constantes del juego', () => {
  it('el bolillero va de 1 a 90', () => {
    expect(MIN_NUMBER).toBe(1);
    expect(MAX_NUMBER).toBe(90);
    expect(TOTAL_NUMBERS).toBe(90);
  });

  it('el carton tiene 15 numeros en una grilla de 3x9', () => {
    expect(CARD_ROWS).toBe(3);
    expect(CARD_COLUMNS).toBe(9);
    expect(NUMBERS_PER_CARD).toBe(CARD_ROWS * NUMBERS_PER_ROW);
    expect(NUMBERS_PER_CARD).toBe(15);
  });

  it('el alfabeto de codigos de sala no tiene caracteres ambiguos', () => {
    for (const ambiguo of ['0', 'O', '1', 'I', 'L']) {
      expect(LOBBY_CODE_ALPHABET).not.toContain(ambiguo);
    }
  });
});
