import { randomUUID } from 'node:crypto';
import {
  CHAT_HISTORY_SIZE,
  DEFAULT_LOBBY_SETTINGS,
  DISCONNECT_GRACE_MS,
  LOBBY_EMPTY_TTL_MS,
  MAX_PLAYERS,
  type ChatMessage,
  type LobbyErrorCode,
  type LobbyPlayerView,
  type LobbyPreview,
  type LobbySettings,
  type LobbyStateView,
  type LobbyVisibility,
  type PublicLobbySummary,
  type RandomInt,
} from '@lota/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateUnusedLobbyCode } from './codes.js';
import type { LobbyStore } from './store.js';
import type { Lobby, LobbyPlayer } from './types.js';

/** Fallo de negocio con un código que el cliente sabe traducir. */
export class LobbyOperationError extends Error {
  constructor(
    readonly code: LobbyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LobbyOperationError';
  }
}

export interface CreateLobbyOptions {
  host: { id: string; username: string };
  name: string;
  visibility: LobbyVisibility;
  password?: string | undefined;
  settings?: Partial<LobbySettings> | undefined;
}

export async function createLobby(
  store: LobbyStore,
  randomInt: RandomInt,
  opciones: CreateLobbyOptions,
): Promise<Lobby> {
  const { host, name, visibility, password, settings } = opciones;

  if (visibility === 'PRIVATE' && !password) {
    throw new LobbyOperationError('DATOS_INVALIDOS', 'Una sala privada necesita contraseña.');
  }

  const lobby: Lobby = {
    id: randomUUID(),
    code: generateUnusedLobbyCode(randomInt, (codigo) => store.has(codigo)),
    name,
    hostId: host.id,
    visibility,
    status: 'WAITING',
    settings: { ...DEFAULT_LOBBY_SETTINGS, ...settings },
    players: new Map(),
    drawn: [],
    bag: [],
    chat: [],
    createdAt: Date.now(),
  };

  // Las contraseñas de sala se hashean igual que las de usuario: viajan por
  // chat y la gente reutiliza claves.
  if (password) lobby.passwordHash = await hashPassword(password);

  store.save(lobby);
  return lobby;
}

export interface JoinLobbyOptions {
  user: { id: string; username: string };
  password?: string | undefined;
}

/** Mete al jugador en la sala, o lo reconecta si ya estaba. */
export async function joinLobby(lobby: Lobby, opciones: JoinLobbyOptions): Promise<LobbyPlayer> {
  const { user, password } = opciones;
  const existente = lobby.players.get(user.id);

  // Reconexión: conserva su sitio, sus cartones y sus marcas.
  if (existente) {
    existente.connected = true;
    delete existente.disconnectedAt;
    delete lobby.emptySince;
    return existente;
  }

  if (lobby.status !== 'WAITING') {
    throw new LobbyOperationError('PARTIDA_EN_CURSO', 'La partida ya empezó.');
  }
  if (lobby.players.size >= MAX_PLAYERS) {
    throw new LobbyOperationError('SALA_LLENA', 'La sala está llena.');
  }
  if (lobby.passwordHash) {
    const correcta = password ? await verifyPassword(lobby.passwordHash, password) : false;
    if (!correcta) {
      throw new LobbyOperationError('PASSWORD_INCORRECTA', 'Contraseña incorrecta.');
    }
  }

  const jugador: LobbyPlayer = {
    userId: user.id,
    username: user.username,
    ready: false,
    connected: true,
    cards: [],
    marks: new Set(),
    equipped: {},
    joinedAt: Date.now(),
  };

  lobby.players.set(user.id, jugador);
  delete lobby.emptySince;

  // El primero en entrar a una sala recién creada se queda de anfitrión.
  if (lobby.players.size === 1) lobby.hostId = user.id;

  return jugador;
}

/** Saca al jugador. Devuelve el nuevo anfitrión si hubo que cambiarlo. */
export function removePlayer(lobby: Lobby, userId: string): { newHostId?: string } {
  if (!lobby.players.delete(userId)) return {};

  if (lobby.players.size === 0) {
    lobby.emptySince = Date.now();
    return {};
  }

  if (lobby.hostId === userId) {
    const nuevo = oldestPlayer(lobby);
    if (nuevo) {
      lobby.hostId = nuevo.userId;
      return { newHostId: nuevo.userId };
    }
  }
  return {};
}

/** El jugador más antiguo de la sala; hereda el rol de anfitrión. */
function oldestPlayer(lobby: Lobby): LobbyPlayer | undefined {
  let elegido: LobbyPlayer | undefined;
  for (const jugador of lobby.players.values()) {
    if (!elegido || jugador.joinedAt < elegido.joinedAt) elegido = jugador;
  }
  return elegido;
}

export function markDisconnected(lobby: Lobby, userId: string): void {
  const jugador = lobby.players.get(userId);
  if (!jugador) return;
  jugador.connected = false;
  jugador.disconnectedAt = Date.now();
}

export function setReady(lobby: Lobby, userId: string, ready: boolean): void {
  const jugador = requirePlayer(lobby, userId);
  if (lobby.status !== 'WAITING') {
    throw new LobbyOperationError('PARTIDA_EN_CURSO', 'La partida ya empezó.');
  }
  jugador.ready = ready;
}

export function updateSettings(
  lobby: Lobby,
  userId: string,
  cambios: Partial<LobbySettings>,
): LobbySettings {
  requireHost(lobby, userId);
  if (lobby.status !== 'WAITING') {
    throw new LobbyOperationError(
      'PARTIDA_EN_CURSO',
      'No se puede cambiar con la partida en curso.',
    );
  }

  lobby.settings = { ...lobby.settings, ...cambios };

  // Cambiar las reglas invalida los "listo" que ya había: nadie acepta a ciegas.
  for (const jugador of lobby.players.values()) jugador.ready = false;

  return lobby.settings;
}

export function kickPlayer(lobby: Lobby, hostId: string, targetId: string): { newHostId?: string } {
  requireHost(lobby, hostId);
  if (hostId === targetId) {
    throw new LobbyOperationError('DATOS_INVALIDOS', 'No puedes expulsarte a ti mismo.');
  }
  if (!lobby.players.has(targetId)) {
    throw new LobbyOperationError('NO_ESTAS_EN_SALA', 'Ese jugador no está en la sala.');
  }
  return removePlayer(lobby, targetId);
}

export function addChatMessage(
  lobby: Lobby,
  user: { id: string; username: string },
  text: string,
): ChatMessage {
  requirePlayer(lobby, user.id);

  const mensaje: ChatMessage = {
    id: randomUUID(),
    userId: user.id,
    username: user.username,
    text,
    sentAt: new Date().toISOString(),
  };

  lobby.chat.push(mensaje);
  // Solo guardamos lo reciente: la sala vive en memoria y no es un archivo.
  if (lobby.chat.length > CHAT_HISTORY_SIZE)
    lobby.chat.splice(0, lobby.chat.length - CHAT_HISTORY_SIZE);

  return mensaje;
}

export function requirePlayer(lobby: Lobby, userId: string): LobbyPlayer {
  const jugador = lobby.players.get(userId);
  if (!jugador) throw new LobbyOperationError('NO_ESTAS_EN_SALA', 'No estás en esta sala.');
  return jugador;
}

export function requireHost(lobby: Lobby, userId: string): void {
  if (lobby.hostId !== userId) {
    throw new LobbyOperationError('NO_ERES_ANFITRION', 'Solo el anfitrión puede hacer eso.');
  }
}

export interface SweepResult {
  /** Jugadores sacados por pasarse del margen de desconexión. */
  removed: { lobbyId: string; userId: string; username: string }[];
  hostChanges: { lobbyId: string; hostId: string; username: string }[];
  deletedLobbyIds: string[];
}

/**
 * Mantenimiento periódico de las salas. Se hace con un barrido en vez de un
 * temporizador por sala: con miles de salas eso serían miles de timers, y así
 * además el test puede pasar el reloj a mano.
 */
export function sweepLobbies(store: LobbyStore, ahora = Date.now()): SweepResult {
  const resultado: SweepResult = { removed: [], hostChanges: [], deletedLobbyIds: [] };

  for (const lobby of store.all()) {
    // Durante la partida nadie pierde su sitio por desconectarse.
    if (lobby.status === 'WAITING') {
      for (const jugador of [...lobby.players.values()]) {
        const caido = !jugador.connected && jugador.disconnectedAt !== undefined;
        if (!caido || ahora - jugador.disconnectedAt! < DISCONNECT_GRACE_MS) continue;

        const { newHostId } = removePlayer(lobby, jugador.userId);
        resultado.removed.push({
          lobbyId: lobby.id,
          userId: jugador.userId,
          username: jugador.username,
        });

        if (newHostId) {
          resultado.hostChanges.push({
            lobbyId: lobby.id,
            hostId: newHostId,
            username: lobby.players.get(newHostId)?.username ?? '',
          });
        }
      }
    }

    if (lobby.players.size === 0) {
      lobby.emptySince ??= ahora;
      if (ahora - lobby.emptySince >= LOBBY_EMPTY_TTL_MS) {
        store.delete(lobby.id);
        resultado.deletedLobbyIds.push(lobby.id);
      }
    }
  }

  return resultado;
}

// --- Proyecciones hacia el cliente ---------------------------------------

export function toPlayerView(lobby: Lobby, jugador: LobbyPlayer): LobbyPlayerView {
  return {
    userId: jugador.userId,
    username: jugador.username,
    ready: jugador.ready,
    connected: jugador.connected,
    isHost: lobby.hostId === jugador.userId,
    equipped: jugador.equipped,
  };
}

/**
 * Estado que se manda a un jugador concreto. Deja fuera la `bag` y los
 * cartones ajenos: el cliente solo recibe lo suyo (PLAN.md sección 11).
 */
export function toLobbyStateView(lobby: Lobby, viewerId: string): LobbyStateView {
  const jugadores = [...lobby.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);

  return {
    id: lobby.id,
    code: lobby.code,
    name: lobby.name,
    hostId: lobby.hostId,
    visibility: lobby.visibility,
    requiresPassword: lobby.passwordHash !== undefined,
    status: lobby.status,
    settings: lobby.settings,
    players: jugadores.map((jugador) => toPlayerView(lobby, jugador)),
    maxPlayers: MAX_PLAYERS,
    drawn: [...lobby.drawn],
    yourCards: lobby.players.get(viewerId)?.cards ?? [],
  };
}

export function toPublicSummary(lobby: Lobby): PublicLobbySummary {
  return {
    code: lobby.code,
    name: lobby.name,
    hostUsername: lobby.players.get(lobby.hostId)?.username ?? '',
    players: lobby.players.size,
    maxPlayers: MAX_PLAYERS,
  };
}

/** Lo que se puede saber de una sala sin haber entrado: nunca si es privada. */
export function toPreview(lobby: Lobby): LobbyPreview {
  return {
    code: lobby.code,
    name: lobby.name,
    requiresPassword: lobby.passwordHash !== undefined,
    players: lobby.players.size,
    maxPlayers: MAX_PLAYERS,
    status: lobby.status,
  };
}
