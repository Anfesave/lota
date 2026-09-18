/**
 * Fuente de aleatoriedad inyectada: devuelve un entero en [0, maxExclusive).
 *
 * No tiene valor por defecto a proposito. El sorteo y los cartones son
 * autoridad del servidor, que inyecta `crypto.randomInt`; si esto cayera en
 * `Math.random` por descuido, los cartones y el bolillero serian predecibles.
 * Ademas mantiene este paquete isomorfico: no importa `node:crypto`, asi que
 * el navegador puede usar los mismos tipos y validaciones.
 */
export type RandomInt = (maxExclusive: number) => number;

/**
 * PRNG determinista (mulberry32) para tests y para reproducir una partida.
 * **No usar en produccion**: es predecible por diseno.
 */
export function createSeededRandomInt(seed: number): RandomInt {
  let estado = seed >>> 0;
  return (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive debe ser un entero positivo, llego ${maxExclusive}`);
    }
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const flotante = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    return Math.floor(flotante * maxExclusive);
  };
}

/** Baraja de Fisher-Yates. Devuelve un arreglo nuevo; no toca el original. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temporal = copia[i]!;
    copia[i] = copia[j]!;
    copia[j] = temporal;
  }
  return copia;
}
