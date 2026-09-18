import type { Lobby } from './types.js';

/**
 * Almacén de salas activas.
 *
 * Existe como interfaz a propósito: hoy vive en la memoria de un solo proceso,
 * que es de sobra para miles de salas de 10 jugadores. Si algún día hicieran
 * falta varias instancias, se cambia por una implementación con Redis sin
 * tocar el resto del servidor (PLAN.md sección 2).
 */
export interface LobbyStore {
  save(lobby: Lobby): void;
  getById(id: string): Lobby | undefined;
  getByCode(code: string): Lobby | undefined;
  delete(id: string): void;
  /** Salas públicas que aún están esperando jugadores, las más nuevas primero. */
  listPublicWaiting(): Lobby[];
  all(): Lobby[];
  has(code: string): boolean;
  clear(): void;
}

export class InMemoryLobbyStore implements LobbyStore {
  readonly #porId = new Map<string, Lobby>();
  /** Índice por código para resolver los links de invitación en O(1). */
  readonly #porCodigo = new Map<string, string>();

  save(lobby: Lobby): void {
    this.#porId.set(lobby.id, lobby);
    this.#porCodigo.set(lobby.code, lobby.id);
  }

  getById(id: string): Lobby | undefined {
    return this.#porId.get(id);
  }

  getByCode(code: string): Lobby | undefined {
    const id = this.#porCodigo.get(code.toUpperCase());
    return id === undefined ? undefined : this.#porId.get(id);
  }

  delete(id: string): void {
    const lobby = this.#porId.get(id);
    if (!lobby) return;
    this.#porCodigo.delete(lobby.code);
    this.#porId.delete(id);
  }

  listPublicWaiting(): Lobby[] {
    return [...this.#porId.values()]
      .filter((lobby) => lobby.visibility === 'PUBLIC' && lobby.status === 'WAITING')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  all(): Lobby[] {
    return [...this.#porId.values()];
  }

  has(code: string): boolean {
    return this.#porCodigo.has(code.toUpperCase());
  }

  clear(): void {
    this.#porId.clear();
    this.#porCodigo.clear();
  }
}
