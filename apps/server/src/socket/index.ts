import {
  LOBBY_SWEEP_INTERVAL_MS,
  lobbyRoom,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@lota/shared';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import { findUserBySessionToken } from '../auth/sessions.js';
import type { UserRow } from '../db/schema.js';
import { callIntervalOverride, countdownOverride } from '../env.js';
import { GameRunner } from '../game/runner.js';
import { sweepLobbies, toLobbyStateView } from '../lobby/service.js';
import type { LobbyStore } from '../lobby/store.js';
import { registerLobbyHandlers } from './lobbyHandlers.js';

export interface SocketData {
  user: UserRow;
  /** Sala en la que está este socket, si entró a alguna. */
  lobbyId?: string;
  /** Marca de tiempo del último chat, para el límite de 1 por segundo. */
  lastChatAt?: number;
}

export type LotaServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
export type LotaSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

declare module 'fastify' {
  interface FastifyInstance {
    io: LotaServer;
    games: GameRunner;
  }
}

/**
 * Manda a cada jugador de la sala su propia vista del estado. Se hace socket a
 * socket porque `yourCards` es distinto para cada uno: nadie debe recibir los
 * cartones de otro (PLAN.md sección 11).
 */
export async function emitLobbyState(
  io: LotaServer,
  store: LobbyStore,
  lobbyId: string,
): Promise<void> {
  const lobby = store.getById(lobbyId);
  if (!lobby) return;

  for (const socket of await io.in(lobbyRoom(lobbyId)).fetchSockets()) {
    socket.emit('lobby:state', toLobbyStateView(lobby, socket.data.user.id));
  }
}

const socketPlugin: FastifyPluginAsync = async (app) => {
  const io: LotaServer = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    // Mismo origen en producción; en desarrollo Vite hace de proxy.
    cors: { origin: false },
  });

  app.decorate('io', io);

  /**
   * El runner solo sabe avisar; quien manda los eventos por la red es esta
   * capa. Asi el motor de la partida no depende de Socket.IO.
   */
  const games = new GameRunner(
    app.lobbies,
    {
      countdown: (lobbyId, seconds) => {
        io.to(lobbyRoom(lobbyId)).emit('game:countdown', { seconds });
      },
      started: async (lobbyId) => {
        const lobby = app.lobbies.getById(lobbyId);
        if (!lobby) return;
        // Cada uno recibe solo sus cartones.
        for (const socket of await io.in(lobbyRoom(lobbyId)).fetchSockets()) {
          const jugador = lobby.players.get(socket.data.user.id);
          socket.emit('game:started', { yourCards: jugador?.cards ?? [] });
        }
      },
      numberCalled: (lobbyId, payload) => {
        io.to(lobbyRoom(lobbyId)).emit('game:numberCalled', payload);
      },
      lineWon: (lobbyId, winners) => {
        io.to(lobbyRoom(lobbyId)).emit('game:lineWon', { winners });
      },
      finished: (lobbyId, payload) => {
        io.to(lobbyRoom(lobbyId)).emit('game:finished', payload);
      },
      state: (lobbyId) => emitLobbyState(io, app.lobbies, lobbyId),
      error: (mensaje, error) => app.log.error(error, mensaje),
    },
    {
      ...(countdownOverride !== undefined ? { countdownSeconds: countdownOverride } : {}),
      callIntervalMsOverride: callIntervalOverride,
    },
  );
  app.decorate('games', games);

  /**
   * Autenticación en el handshake: sin sesión válida no se acepta la conexión.
   * Reutiliza la misma cookie firmada que la API, así no hay un segundo
   * mecanismo de sesión que mantener.
   */
  io.use((socket, next) => {
    const cabecera = socket.handshake.headers.cookie;
    if (!cabecera) return next(new Error('NO_AUTENTICADO'));

    const crudo = app.parseCookie(cabecera)[SESSION_COOKIE_NAME];
    if (!crudo) return next(new Error('NO_AUTENTICADO'));

    const { valid, value } = app.unsignCookie(crudo);
    if (!valid || !value) return next(new Error('NO_AUTENTICADO'));

    findUserBySessionToken(value)
      .then((usuario) => {
        if (!usuario) return next(new Error('NO_AUTENTICADO'));
        socket.data.user = usuario;
        next();
      })
      .catch((error: unknown) => {
        app.log.error(error, 'fallo al autenticar un socket');
        next(new Error('NO_AUTENTICADO'));
      });
  });

  io.on('connection', (socket) => {
    registerLobbyHandlers(app, io, socket);
  });

  /**
   * Barrido periódico: saca a los desconectados que pasaron el margen, cambia
   * de anfitrión cuando hace falta y borra las salas vacías. Va aquí porque es
   * el único sitio desde el que se puede avisar a los que siguen conectados.
   */
  const temporizador = setInterval(() => {
    void barrer(app, io);
  }, LOBBY_SWEEP_INTERVAL_MS);
  temporizador.unref();

  app.addHook('onClose', async () => {
    clearInterval(temporizador);
    games.stopAll();
    // Render da unos segundos de gracia: avisamos antes de cortar.
    io.emit('server:shutdown', { reason: 'El servidor se está reiniciando.' });
    await io.close();
  });
};

/** Exportado para que los tests puedan forzar un barrido sin esperar al reloj. */
export async function barrer(
  app: {
    lobbies: LobbyStore;
    log: { error: (...args: unknown[]) => void };
    games?: { stop: (lobbyId: string) => void };
  },
  io: LotaServer,
  ahora = Date.now(),
): Promise<void> {
  try {
    const resultado = sweepLobbies(app.lobbies, ahora);
    const tocadas = new Set<string>();

    for (const salida of resultado.removed) {
      tocadas.add(salida.lobbyId);
      io.to(lobbyRoom(salida.lobbyId)).emit('lobby:playerLeft', {
        userId: salida.userId,
        username: salida.username,
      });
    }
    for (const cambio of resultado.hostChanges) {
      io.to(lobbyRoom(cambio.lobbyId)).emit('lobby:hostChanged', {
        hostId: cambio.hostId,
        username: cambio.username,
      });
    }
    // Una sala borrada no debe dejar el locutor corriendo.
    for (const lobbyId of resultado.deletedLobbyIds) app.games?.stop(lobbyId);

    for (const lobbyId of tocadas) {
      if (resultado.deletedLobbyIds.includes(lobbyId)) continue;
      await emitLobbyState(io, app.lobbies, lobbyId);
    }
  } catch (error) {
    app.log.error(error, 'fallo el barrido de salas');
  }
}

export default fp(socketPlugin, { name: 'socket', dependencies: ['auth', 'lobbies'] });
