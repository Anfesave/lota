import { createLobbySchema, lobbyCodeSchema } from '@lota/shared';
import type { FastifyPluginAsync } from 'fastify';
import { createLobby, toPreview, toPublicSummary } from '../lobby/service.js';
import { cryptoRandomInt } from '../random.js';

export const lobbyRoutes: FastifyPluginAsync = async (app) => {
  /** Listado del lobby principal: solo salas públicas que aún esperan gente. */
  app.get('/lobbies', { preHandler: app.requireAuth }, async () => ({
    lobbies: app.lobbies.listPublicWaiting().map(toPublicSummary),
  }));

  app.post('/lobbies', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = createLobbySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'DATOS_INVALIDOS',
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
      });
    }

    const usuario = request.user!;
    const { name, visibility, password, settings } = parsed.data;

    const lobby = await createLobby(app.lobbies, cryptoRandomInt, {
      host: { id: usuario.id, username: usuario.username },
      name,
      visibility,
      password,
      settings,
    });

    // El anfitrión entra de verdad a la sala por socket; aquí solo se crea.
    return reply.status(201).send({ code: lobby.code });
  });

  /** Información pública de una sala, para la pantalla previa a entrar. */
  app.get<{ Params: { code: string } }>(
    '/lobbies/:code',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const parsed = lobbyCodeSchema.safeParse(request.params.code);
      if (!parsed.success) {
        return reply.status(400).send({ code: 'DATOS_INVALIDOS', message: 'Código inválido.' });
      }

      const lobby = app.lobbies.getByCode(parsed.data);
      if (!lobby) {
        return reply.status(404).send({ code: 'SALA_NO_EXISTE', message: 'Esa sala no existe.' });
      }

      return toPreview(lobby);
    },
  );
};
