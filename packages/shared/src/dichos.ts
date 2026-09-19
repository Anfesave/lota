/**
 * Dichos tradicionales de la lota, por número.
 *
 * **Este archivo está para que lo completes.** Vienen solo unos pocos de
 * relleno: la gracia es que cada quien ponga los suyos, que además cambian
 * mucho de una región a otra. Si un número tiene varios, el locutor elige uno
 * al azar; si no tiene ninguno, canta el número a secas.
 *
 * Se activan por sala con el interruptor `dichos` de la configuración.
 */
export const DICHOS: Record<number, string[]> = {
  1: ['El primerito', 'El solterón'],
  2: ['El patito'],
  5: ['La manito'],
  7: ['La suerte'],
  // Pedido expresamente: el 11 siempre sale con esta.
  11: ['Chúpalo entonces'],
  13: ['La mala suerte'],
  15: ['La niña bonita'],
  22: ['Los patitos'],
  33: ['La edad de Cristo'],
  44: ['Las sillitas'],
  50: ['La mitad del camino'],
  55: ['Los ganchitos'],
  66: ['Las bolitas'],
  69: ['El de cabeza'],
  77: ['Las banderas'],
  88: ['Los anteojos'],
  90: ['El abuelo', 'El último'],
};

/**
 * Devuelve un dicho para el número, o undefined si no tiene ninguno.
 * La aleatoriedad se inyecta, igual que en el resto del paquete.
 */
export function dichoPara(
  numero: number,
  randomInt: (maxExclusive: number) => number,
): string | undefined {
  const opciones = DICHOS[numero];
  if (!opciones || opciones.length === 0) return undefined;
  return opciones[randomInt(opciones.length)];
}
