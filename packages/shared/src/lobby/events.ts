import type { JoinLobbyInput, UpdateSettingsInput } from './schemas.js';
import type {
  ChatMessage,
  LobbyError,
  LobbyPlayerView,
  LobbySettings,
  LobbyStateView,
} from './types.js';

/**
 * Respuesta de un evento con acuse de recibo. El cliente siempre sabe si su
 * acción salió o no, sin tener que adivinar por el estado que llega después.
 */
export type AckResponse<T = undefined> = { ok: true; data: T } | { ok: false; error: LobbyError };

export type Ack<T = undefined> = (respuesta: AckResponse<T>) => void;

/**
 * Los tipos de los payloads son una ayuda para escribir el cliente, no una
 * garantía: el servidor revalida todo con Zod, porque el cliente puede mentir.
 */
export interface ClientToServerEvents {
  'lobby:join': (payload: JoinLobbyInput, ack: Ack<LobbyStateView>) => void;
  'lobby:leave': (ack: Ack) => void;
  'lobby:ready': (payload: { ready: boolean }, ack: Ack) => void;
  'lobby:updateSettings': (payload: UpdateSettingsInput, ack: Ack) => void;
  'lobby:kick': (payload: { userId: string }, ack: Ack) => void;
  'chat:send': (payload: { text: string }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (state: LobbyStateView) => void;
  'lobby:playerJoined': (payload: { player: LobbyPlayerView }) => void;
  'lobby:playerLeft': (payload: { userId: string; username: string }) => void;
  'lobby:settingsChanged': (payload: { settings: LobbySettings }) => void;
  'lobby:hostChanged': (payload: { hostId: string; username: string }) => void;
  /** Solo al expulsado, justo antes de sacarlo de la sala. */
  'lobby:kicked': (payload: { reason: string }) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (payload: { messages: ChatMessage[] }) => void;
  /** Render reinicia el servicio: las salas en memoria se pierden. */
  'server:shutdown': (payload: { reason: string }) => void;
  error: (error: LobbyError) => void;
}

/** Sala de Socket.IO que agrupa a los jugadores de un lobby. */
export function lobbyRoom(lobbyId: string): string {
  return `lobby:${lobbyId}`;
}
