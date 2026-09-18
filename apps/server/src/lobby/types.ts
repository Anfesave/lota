import type {
  Card,
  EquippedCosmetics,
  LobbySettings,
  LobbyStatus,
  LobbyVisibility,
  ChatMessage,
} from '@lota/shared';

/**
 * Jugador dentro de una sala, tal como lo guarda el servidor. Lleva cartones y
 * marcas, que nunca salen enteros hacia el cliente.
 */
export interface LobbyPlayer {
  userId: string;
  username: string;
  ready: boolean;
  connected: boolean;
  cards: Card[];
  marks: Set<number>;
  claimBlockedUntil?: number;
  equipped: EquippedCosmetics;
  /** Para elegir al anfitrión más antiguo cuando el actual se cae. */
  joinedAt: number;
  /** Momento de la desconexión, para el margen de gracia. */
  disconnectedAt?: number;
}

/**
 * Sala en memoria. No se persiste: al reiniciar Render se pierden todas, y el
 * cliente tiene que aguantarlo (PLAN.md sección 12.4).
 */
export interface Lobby {
  id: string;
  code: string;
  name: string;
  hostId: string;
  visibility: LobbyVisibility;
  /** Solo en salas privadas. Hasheada con argon2, nunca en claro. */
  passwordHash?: string;
  status: LobbyStatus;
  settings: LobbySettings;
  players: Map<string, LobbyPlayer>;
  /** Números cantados, en orden. Se llena en la Fase 4. */
  drawn: number[];
  /** Números que faltan, ya barajados. **Nunca** se manda al cliente. */
  bag: number[];
  lineWinnerIds?: string[];
  winnerIds?: string[];
  chat: ChatMessage[];
  createdAt: number;
  /** Desde cuándo no queda nadie; sirve para borrarla a los 2 minutos. */
  emptySince?: number;
}
