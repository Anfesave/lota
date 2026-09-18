import { type CurrentUser, updateMeSchema } from '@lota/shared';
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';

/** Proyeccion publica del usuario. `equipped` se llenara en la Fase 6. */
export function toCurrentUser(user: UserRow): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    victoryMessage: user.victoryMessage,
    coins: user.coins,
    createdAt: user.createdAt.toISOString(),
    equipped: {},
  };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: app.requireAuth }, async (request) => {
    // requireAuth ya respondio 401 si no habia usuario.
    return toCurrentUser(request.user!);
  });

  app.patch('/me', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'DATOS_INVALIDOS',
        message: parsed.error.issues[0]?.message ?? 'Datos invalidos.',
      });
    }

    const [actualizado] = await getDb()
      .update(users)
      .set({ victoryMessage: parsed.data.victoryMessage })
      .where(eq(users.id, request.user!.id))
      .returning();

    return toCurrentUser(actualizado!);
  });
};
