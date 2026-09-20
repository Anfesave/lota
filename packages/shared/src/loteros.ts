import type { RandomInt } from './game/random.js';

/**
 * Las loteras: las gatas que cantan los números.
 *
 * Cada partida sortea una y todos los de la sala ven la misma, para que el
 * sorteo siga siendo cosa del servidor. La Negra es la cara de la aplicación y
 * la que sale cuando todavía no hay partida.
 */
export const LOTERO_IDS = ['negra', 'rayada', 'colorina'] as const;
export type LoteroId = (typeof LOTERO_IDS)[number];

export interface Lotero {
  id: LoteroId;
  nombre: string;
  /** Ruta dentro de `public/`, servida tal cual por Vite y por Fastify. */
  imagen: string;
}

export const LOTEROS: Record<LoteroId, Lotero> = {
  negra: { id: 'negra', nombre: 'El Cleo', imagen: '/loteros/negra.webp' },
  rayada: { id: 'rayada', nombre: 'La Nevada', imagen: '/loteros/rayada.webp' },
  colorina: { id: 'colorina', nombre: 'La Chiliven', imagen: '/loteros/colorina.webp' },
};

/** La que representa a la aplicación fuera de la partida. */
export const LOTERO_POR_DEFECTO: LoteroId = 'negra';

/** Sortea una lotera. Todas con la misma probabilidad. */
export function pickLotero(randomInt: RandomInt): LoteroId {
  return LOTERO_IDS[randomInt(LOTERO_IDS.length)] ?? LOTERO_POR_DEFECTO;
}

/** Devuelve la lotera por su id, con la Negra de respaldo. */
export function loteroById(id: string | undefined): Lotero {
  return LOTEROS[(id ?? '') as LoteroId] ?? LOTEROS[LOTERO_POR_DEFECTO];
}
