import type { Card } from '../game/types.js';

export type LobbyStatus = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
export type LobbyVisibility = 'PUBLIC' | 'PRIVATE';
export type PrizeMode = 'CARTON_LLENO' | 'LINEA_Y_CARTON';

export interface LobbySettings {
  cardsPerPlayer: 1 | 2 | 3 | 4;
  /** Rapida / Normal / Lenta / Muy lenta. */
  callIntervalMs: 3000 | 5000 | 8000 | 12000;
  prizeMode: PrizeMode;
  /** Si el sistema marca los numeros solo, en vez de hacerlo el jugador. */
  autoMark: boolean;
}

/** Cosmeticos equipados por tipo. Se llena en la Fase 6. */
export type EquippedCosmetics = Record<string, string>;

/**
 * Jugador tal como lo ven todos los demas. Nunca lleva cartones: durante la
 * partida cada uno solo conoce los suyos (PLAN.md seccion 11).
 */
export interface LobbyPlayerView {
  userId: string;
  username: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  equipped: EquippedCosmetics;
}

/**
 * Estado de sala sanitizado. Sale de aqui la `bag` y los cartones ajenos;
 * `yourCards` solo viaja al dueno.
 */
export interface LobbyStateView {
  id: string;
  code: string;
  name: string;
  hostId: string;
  visibility: LobbyVisibility;
  requiresPassword: boolean;
  status: LobbyStatus;
  settings: LobbySettings;
  players: LobbyPlayerView[];
  maxPlayers: number;
  /** Numeros ya cantados, en orden. Vacio hasta la Fase 4. */
  drawn: number[];
  /** Cartones del destinatario del mensaje. Vacio hasta la Fase 4. */
  yourCards: Card[];
}

/** Fila del listado de salas publicas. */
export interface PublicLobbySummary {
  code: string;
  name: string;
  hostUsername: string;
  players: number;
  maxPlayers: number;
}

/** Informacion que se puede ver de una sala sin haber entrado. */
export interface LobbyPreview {
  code: string;
  name: string;
  requiresPassword: boolean;
  players: number;
  maxPlayers: number;
  status: LobbyStatus;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: string;
}

/** Codigos de error que el servidor puede mandar por socket. */
export type LobbyErrorCode =
  | 'NO_AUTENTICADO'
  | 'SALA_NO_EXISTE'
  | 'SALA_LLENA'
  | 'PASSWORD_INCORRECTA'
  | 'PARTIDA_EN_CURSO'
  | 'NO_ERES_ANFITRION'
  | 'NO_ESTAS_EN_SALA'
  | 'DATOS_INVALIDOS'
  | 'DEMASIADO_RAPIDO';

export interface LobbyError {
  code: LobbyErrorCode;
  message: string;
}
