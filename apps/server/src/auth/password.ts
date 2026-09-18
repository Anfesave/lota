import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * Parametros argon2id recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo).
 * Caben de sobra en el plan Free de Render.
 *
 * Usamos @node-rs/argon2 en vez del paquete `argon2` porque trae binarios
 * precompilados para Windows y Linux: el algoritmo es el mismo (argon2id),
 * pero no hace falta cadena de compilacion nativa ni en local ni en Render.
 */
/**
 * `Algorithm.Argon2id`. Se fija por valor porque el enum de la libreria es un
 * `const enum` ambiental y `verbatimModuleSyntax` prohibe importarlo en runtime.
 */
const ARGON2ID = 2 as Algorithm;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS);
  } catch {
    // Hash corrupto o en un formato desconocido: se trata como no coincidente.
    return false;
  }
}
