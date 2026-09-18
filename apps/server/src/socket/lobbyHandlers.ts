import {
  CHAT_RATE_LIMIT_MS,
  chatSendSchema,
  claimSchema,
  joinLobbySchema,
  kickSchema,
  lobbyRoom,
  markSchema,
  readySchema,
  setBetSchema,
  updateSettingsSchema,
  type Ack,
  type LobbyError,
  type LobbyStateView,
} from '@lota/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addChatMessage,
  joinLobby,
  kickPlayer,
  LobbyOperationError,
  markDisconnected,
  removePlayer,
  setBet,
  setReady,
  toLobbyStateView,
  toPlayerView,
  updateSettings,
} from '../lobby/service.js';
import { getEquipped } from '../economy/cosmetics.js';
import { claim, markNumber, prepareGame } from '../game/engine.js';
import type { Lobby } from '../lobby/types.js';
import { cryptoRandomInt } from '../random.js';
import { emitLobbyState, type LotaServer, type LotaSocket } from './index.js';

/**
 * Envuelve un manejador para que **siempre** conteste el acuse de recibo, aun
 * si falla. El cliente nunca se queda esperando sin saber qué pasó.
 */
function responder<T>(
  app: FastifyInstance,
  ack: Ack<T> | undefined,
  accion: () => Promise<T> | T,
): void {
  void (async () => {
    try {
      const data = await accion();
      ack?.({ ok: true, data });
    } catch (error) {
      ack?.({ ok: false, error: aLobbyError(app, error) });
    }
  })();
}

function aLobbyError(app: FastifyInstance, error: unknown): LobbyError {
  if (error instanceof LobbyOperationError) return { code: error.code, message: error.message };

  if (error instanceof z.ZodError) {
    // Un payload inválido significa cliente viejo o manipulado: se registra.
    app.log.warn({ issues: error.issues }, 'payload de socket inválido');
    return {
      code: 'DATOS_INVALIDOS',
      message: error.issues[0]?.message ?? 'Datos inválidos.',
    };
  }

  app.log.error(error, 'error inesperado en un evento de socket');
  return { code: 'DATOS_INVALIDOS', message: 'Algo salió mal.' };
}

export function registerLobbyHandlers(
  app: FastifyInstance,
  io: LotaServer,
  socket: LotaSocket,
): void {
  const usuario = socket.data.user;

  /** Sala en la que está este socket; lanza si no entró a ninguna. */
  function salaActual(): Lobby {
    const { lobbyId } = socket.data;
    const lobby = lobbyId ? app.lobbies.getById(lobbyId) : undefined;
    if (!lobby) throw new LobbyOperationError('NO_ESTAS_EN_SALA', 'No estás en ninguna sala.');
    return lobby;
  }

  socket.on('lobby:join', (payload, ack) => {
    responder<LobbyStateView>(app, ack, async () => {
      const { code, password } = joinLobbySchema.parse(payload);

      const lobby = app.lobbies.getByCode(code);
      if (!lobby) throw new LobbyOperationError('SALA_NO_EXISTE', 'Esa sala no existe.');

      // Cambiar de sala sin pasar por lobby:leave dejaría al jugador fantasma.
      if (socket.data.lobbyId && socket.data.lobbyId !== lobby.id) {
        await salirDeSala();
      }

      const yaEstaba = lobby.players.has(usuario.id);
      await joinLobby(lobby, {
        user: {
          id: usuario.id,
          username: usuario.username,
          victoryMessage: usuario.victoryMessage,
          equipped: await getEquipped(usuario.id),
        },
        password,
      });

      socket.data.lobbyId = lobby.id;
      await socket.join(lobbyRoom(lobby.id));

      if (!yaEstaba) {
        const jugador = lobby.players.get(usuario.id)!;
        socket.to(lobbyRoom(lobby.id)).emit('lobby:playerJoined', {
          player: toPlayerView(lobby, jugador),
        });
      }

      socket.emit('chat:history', { messages: lobby.chat });
      await emitLobbyState(io, app.lobbies, lobby.id);

      return toLobbyStateView(lobby, usuario.id);
    });
  });

  socket.on('lobby:leave', (ack) => {
    responder(app, ack, async () => {
      await salirDeSala();
      return undefined;
    });
  });

  socket.on('lobby:ready', (payload, ack) => {
    responder(app, ack, async () => {
      const { ready } = readySchema.parse(payload);
      const lobby = salaActual();
      setReady(lobby, usuario.id, ready);
      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('lobby:updateSettings', (payload, ack) => {
    responder(app, ack, async () => {
      const cambios = updateSettingsSchema.parse(payload);
      const lobby = salaActual();

      const settings = updateSettings(lobby, usuario.id, cambios);

      io.to(lobbyRoom(lobby.id)).emit('lobby:settingsChanged', { settings });
      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('lobby:kick', (payload, ack) => {
    responder(app, ack, async () => {
      const { userId } = kickSchema.parse(payload);
      const lobby = salaActual();
      const expulsado = lobby.players.get(userId);

      const { newHostId } = kickPlayer(lobby, usuario.id, userId);

      // Avisar y sacar de la sala de sockets a todas las pestañas del expulsado.
      for (const otro of await io.in(lobbyRoom(lobby.id)).fetchSockets()) {
        if (otro.data.user.id !== userId) continue;
        otro.emit('lobby:kicked', { reason: 'El anfitrión te sacó de la sala.' });
        otro.data.lobbyId = undefined;
        await otro.leave(lobbyRoom(lobby.id));
      }

      io.to(lobbyRoom(lobby.id)).emit('lobby:playerLeft', {
        userId,
        username: expulsado?.username ?? '',
      });
      if (newHostId) avisarNuevoAnfitrion(lobby, newHostId);

      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('lobby:setBet', (payload, ack) => {
    responder(app, ack, async () => {
      const { amount } = setBetSchema.parse(payload);
      const lobby = salaActual();

      setBet(lobby, usuario.id, amount);
      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('chat:send', (payload, ack) => {
    responder(app, ack, async () => {
      const ahora = Date.now();
      const ultimo = socket.data.lastChatAt ?? 0;
      if (ahora - ultimo < CHAT_RATE_LIMIT_MS) {
        throw new LobbyOperationError('DEMASIADO_RAPIDO', 'Espera un segundo antes de escribir.');
      }

      const { text } = chatSendSchema.parse(payload);
      const lobby = salaActual();

      const mensaje = addChatMessage(lobby, { id: usuario.id, username: usuario.username }, text);
      socket.data.lastChatAt = ahora;

      io.to(lobbyRoom(lobby.id)).emit('chat:message', mensaje);
      return undefined;
    });
  });

  socket.on('game:start', (ack) => {
    responder(app, ack, async () => {
      const lobby = salaActual();
      prepareGame(lobby, usuario.id, cryptoRandomInt);

      app.games.start(lobby);
      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('game:mark', (payload, ack) => {
    responder(app, ack, () => {
      const { cardIndex, number } = markSchema.parse(payload);
      const lobby = salaActual();

      markNumber(lobby, usuario.id, cardIndex, number);

      // La marca es solo del jugador: no se difunde a la sala entera.
      socket.emit('lobby:state', toLobbyStateView(lobby, usuario.id));
      return undefined;
    });
  });

  socket.on('game:claim', (payload, ack) => {
    responder(app, ack, async () => {
      const { type, cardIndex } = claimSchema.parse(payload);
      const lobby = salaActual();

      const resultado = claim(lobby, usuario.id, type, cardIndex);

      if (resultado.kind === 'RECHAZADO') {
        socket.emit('game:claimRejected', {
          type,
          reason: resultado.reason,
          blockedUntil: resultado.blockedUntil,
        });
        return undefined;
      }

      // El anuncio lo hace el runner cuando cierra la ventana de empate, para
      // que quien cante con el mismo numero tambien entre en el premio.
      app.games.onClaim(lobby, resultado);
      await emitLobbyState(io, app.lobbies, lobby.id);
      return undefined;
    });
  });

  socket.on('disconnect', () => {
    void (async () => {
      const { lobbyId } = socket.data;
      if (!lobbyId) return;

      const lobby = app.lobbies.getById(lobbyId);
      if (!lobby) return;

      // Si el usuario tiene otra pestaña abierta en la misma sala, sigue dentro.
      const otras = await io.in(lobbyRoom(lobbyId)).fetchSockets();
      if (otras.some((otro) => otro.data.user.id === usuario.id && otro.id !== socket.id)) return;

      // No se le saca de inmediato: conserva su sitio durante el margen de
      // gracia y, si estaba jugando, hasta el final de la partida.
      markDisconnected(lobby, usuario.id);
      await emitLobbyState(io, app.lobbies, lobbyId);
    })();
  });

  /** Salida voluntaria: aquí sí se pierde el sitio en el acto. */
  async function salirDeSala(): Promise<void> {
    const { lobbyId } = socket.data;
    if (!lobbyId) return;

    socket.data.lobbyId = undefined;
    await socket.leave(lobbyRoom(lobbyId));

    const lobby = app.lobbies.getById(lobbyId);
    if (!lobby) return;

    const { newHostId } = removePlayer(lobby, usuario.id);

    io.to(lobbyRoom(lobbyId)).emit('lobby:playerLeft', {
      userId: usuario.id,
      username: usuario.username,
    });
    if (newHostId) avisarNuevoAnfitrion(lobby, newHostId);

    await emitLobbyState(io, app.lobbies, lobbyId);
  }

  function avisarNuevoAnfitrion(lobby: Lobby, hostId: string): void {
    io.to(lobbyRoom(lobby.id)).emit('lobby:hostChanged', {
      hostId,
      username: lobby.players.get(hostId)?.username ?? '',
    });
  }
}
