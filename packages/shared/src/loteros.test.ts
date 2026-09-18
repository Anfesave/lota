import { describe, expect, it } from 'vitest';
import { createSeededRandomInt } from './game/random.js';
import { LOTEROS, LOTERO_IDS, LOTERO_POR_DEFECTO, loteroById, pickLotero } from './loteros.js';

describe('loteras', () => {
  it('hay tres y cada una tiene nombre e imagen', () => {
    expect(LOTERO_IDS).toHaveLength(3);
    for (const id of LOTERO_IDS) {
      expect(LOTEROS[id].nombre).toBeTruthy();
      expect(LOTEROS[id].imagen).toMatch(/^\/loteros\/.+\.webp$/);
    }
  });

  it('la Negra es la representante por defecto', () => {
    expect(LOTERO_POR_DEFECTO).toBe('negra');
    expect(loteroById(undefined).id).toBe('negra');
    expect(loteroById('no-existe').id).toBe('negra');
  });

  it('el sorteo le da la oportunidad a las tres', () => {
    const randomInt = createSeededRandomInt(2026);
    const salidas = new Set<string>();
    for (let i = 0; i < 300; i++) salidas.add(pickLotero(randomInt));

    expect([...salidas].sort()).toEqual([...LOTERO_IDS].sort());
  });

  it('el reparto es parejo, sin ninguna arrinconada', () => {
    const randomInt = createSeededRandomInt(7);
    const cuenta: Record<string, number> = {};
    const tiradas = 3_000;
    for (let i = 0; i < tiradas; i++) {
      const id = pickLotero(randomInt);
      cuenta[id] = (cuenta[id] ?? 0) + 1;
    }

    // Con 3.000 tiradas, un tercio es 1.000; se deja margen de sobra.
    for (const id of LOTERO_IDS) {
      expect(cuenta[id]).toBeGreaterThan(tiradas / 3 - 200);
      expect(cuenta[id]).toBeLessThan(tiradas / 3 + 200);
    }
  });
});
