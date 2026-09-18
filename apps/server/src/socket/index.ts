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
    // Render da unos segundos de gracia: avisamos antes de cortar.
    io.emit('server:shutdown', { reason: 'El servidor se está reiniciando.' });
    await io.close();
  });
};

/** Exportado para que los tests puedan forzar un barrido sin esperar al reloj. */
export async function barrer(
  app: { lobbies: LobbyStore; log: { error: (...args: unknown[]) => void } },
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
    for (const lobbyId of tocadas) {
      if (resultado.deletedLobbyIds.includes(lobbyId)) continue;
      await emitLobbyState(io, app.lobbies, lobbyId);
    }
  } catch (error) {
    app.log.error(error, 'fallo el barrido de salas');
  }
}

export default fp(socketPlugin, { name: 'socket', dependencies: ['auth', 'lobbies'] });
