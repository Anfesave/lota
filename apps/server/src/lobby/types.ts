import type {
  Card,
  EquippedCosmetics,
  LobbySettings,
  LobbyStatus,
  LobbyVisibility,
  ChatMessage,
  LoteroId,
} from '@lota/shared';

/**
 * Jugador dentro de una sala, tal como lo guarda el servidor. Lleva cartones y
 * marcas, que nunca salen enteros hacia el cliente.
 */
export interface LobbyPlayer {
  userId: string;
  username: string;
  /** Se copia al entrar: la pantalla de victoria lo muestra sin ir a la BD. */
  victoryMessage: string;
  ready: boolean;
  connected: boolean;
  cards: Card[];
  marks: Set<number>;
  claimBlockedUntil?: number;
  /** Lo que anoto para el pozo, en pesos. Registro, no dinero movido. */
  bet: number;
  /** Menor umbral de "le faltan N" ya avisado, para no repetirlo. */
  closeAnnounced?: number;
  /** Con que carton gano, para mostrarlo en la pantalla de victoria. */
  winningCardIndex?: number;
  equipped: EquippedCosmetics;
  /** Cuentas acumuladas en esta sala, a lo largo de las partidas. */
  tally: { partidas: number; ganadas: number; apostado: number; ganado: number };
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
  lineWinnerIds: string[];
  winnerIds: string[];
  /** Fin de la ventana de empate de la linea; despues ya no se puede cantar. */
  lineClosesAt?: number;
  /** Fin de la ventana de empate del carton lleno. */
  fullClosesAt?: number;
  /** La gata que canta; se sortea en cada partida. */
  lotero: LoteroId;
  /** Partidas terminadas en esta sala. */
  partidasJugadas: number;
  /** Total que ha pasado por los pozos de esta sala. */
  pozoAcumulado: number;
  chat: ChatMessage[];
  createdAt: number;
  /** Desde cuándo no queda nadie; sirve para borrarla a los 2 minutos. */
  emptySince?: number;
}
