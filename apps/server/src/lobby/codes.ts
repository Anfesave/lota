import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, type RandomInt } from '@lota/shared';

/**
 * Codigo legible de 6 caracteres para el link de invitacion. El alfabeto no
 * tiene caracteres ambiguos (0/O, 1/I/L), asi que se puede dictar por telefono.
 */
export function generateLobbyCode(randomInt: RandomInt): string {
  let codigo = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    codigo += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
  }
  return codigo;
}

/** Tope de reintentos si el codigo sorteado ya estaba en uso. */
const MAX_INTENTOS = 20;

export function generateUnusedLobbyCode(
  randomInt: RandomInt,
  estaEnUso: (codigo: string) => boolean,
): string {
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const codigo = generateLobbyCode(randomInt);
    if (!estaEnUso(codigo)) return codigo;
  }
  // 31^6 son casi 900 millones de combinaciones: llegar aqui significa que algo
  // va muy mal (por ejemplo, una fuente de aleatoriedad rota).
  throw new Error(`no se encontro un codigo de sala libre en ${MAX_INTENTOS} intentos`);
}
