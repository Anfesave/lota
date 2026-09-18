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
  /** Si el locutor dice los dichos tradicionales ademas del numero. */
  dichos: boolean;
  /**
   * Si los jugadores pueden anotar una apuesta antes de empezar. Es un
   * **registro entre amigos**: la aplicacion no mueve dinero (ver economy.ts).
   */
  apuestas: boolean;
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
  /** Lo que anoto para el pozo; 0 si no apuesta o la sala no tiene apuestas. */
  bet: number;
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
  /** Numeros ya cantados, en orden. */
  drawn: number[];
  /** Cartones del destinatario del mensaje; nunca los de otros. */
  yourCards: Card[];
  /**
   * Numeros que el destinatario lleva marcados. Viaja en el estado para que al
   * reconectar recupere su carton tal como lo tenia.
   */
  yourMarks: number[];
  /** Hasta cuando no puede volver a cantar tras una lota invalida. */
  yourClaimBlockedUntil?: number;
  /** Quienes ganaron la linea, si el modo la incluye. */
  lineWinnerIds: string[];
  /** Quienes ganaron el carton lleno. */
  winnerIds: string[];
  /** Suma de las apuestas de la sala. */
  pot: number;
  /** Lo que apostó el destinatario del mensaje. */
  yourBet: number;
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
  | 'DEMASIADO_RAPIDO'
  | 'PARTIDA_NO_EMPEZADA'
  | 'NUMERO_NO_CANTADO'
  | 'CARTON_INVALIDO'
  | 'CLAIM_BLOQUEADO'
  | 'CLAIM_INVALIDO'
  | 'LINEA_YA_GANADA'
  | 'FALTAN_JUGADORES'
  /** El cliente se canso de esperar el acuse; no lo genera el servidor. */
  | 'SIN_RESPUESTA'
  | 'APUESTAS_DESACTIVADAS'
  | 'APUESTA_INVALIDA'
  | 'SALDO_INSUFICIENTE'
  | 'YA_LO_TIENES'
  | 'COSMETICO_NO_EXISTE';

export interface LobbyError {
  code: LobbyErrorCode;
  message: string;
}
