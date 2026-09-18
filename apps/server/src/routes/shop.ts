import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buyCosmetic, equipCosmetic, getShop } from '../economy/cosmetics.js';
import { getHistory } from '../economy/games.js';
import { LobbyOperationError } from '../lobby/service.js';

const cosmeticIdSchema = z.object({ cosmeticId: z.string().uuid() });

/** Traduce un fallo de negocio en una respuesta HTTP con su codigo. */
function estadoPara(codigo: string): number {
  if (codigo === 'SALDO_INSUFICIENTE') return 402;
  if (codigo === 'COSMETICO_NO_EXISTE') return 404;
  if (codigo === 'YA_LO_TIENES') return 409;
  return 400;
}

export const shopRoutes: FastifyPluginAsync = async (app) => {
  app.get('/shop', { preHandler: app.requireAuth }, async (request) => getShop(request.user!.id));

  app.post('/shop/buy', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = cosmeticIdSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'DATOS_INVALIDOS', message: 'Datos invalidos.' });
    }

    try {
      await buyCosmetic(request.user!.id, parsed.data.cosmeticId);
    } catch (error) {
      if (error instanceof LobbyOperationError) {
        return reply
          .status(estadoPara(error.code))
          .send({ code: error.code, message: error.message });
      }
      throw error;
    }

    return getShop(request.user!.id);
  });

  app.post('/cosmetics/equip', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = cosmeticIdSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'DATOS_INVALIDOS', message: 'Datos invalidos.' });
    }

    try {
      await equipCosmetic(request.user!.id, parsed.data.cosmeticId);
    } catch (error) {
      if (error instanceof LobbyOperationError) {
        return reply
          .status(estadoPara(error.code))
          .send({ code: error.code, message: error.message });
      }
      throw error;
    }

    return getShop(request.user!.id);
  });

  app.get('/me/history', { preHandler: app.requireAuth }, async (request) => ({
    games: await getHistory(request.user!.id),
  }));
};
