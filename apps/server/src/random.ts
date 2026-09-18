import { randomInt } from 'node:crypto';
import type { RandomInt } from '@lota/shared';

/**
 * Aleatoriedad del servidor. El sorteo, los cartones y los codigos de sala
 * usan esto y nunca `Math.random`: el cliente no decide nada y nada debe ser
 * predecible (PLAN.md seccion 3).
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);
