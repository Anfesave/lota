import { type CurrentUser, updateMeSchema } from '@lota/shared';
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';
import { getEquipped } from '../economy/cosmetics.js';

/** Proyeccion publica del usuario, sin los cosmeticos equipados. */
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

/** Igual que `toCurrentUser`, pero consultando los cosmeticos equipados. */
export async function toCurrentUserWithEquipped(user: UserRow): Promise<CurrentUser> {
  return { ...toCurrentUser(user), equipped: await getEquipped(user.id) };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: app.requireAuth }, async (request) => {
    // requireAuth ya respondio 401 si no habia usuario.
    return toCurrentUserWithEquipped(request.user!);
  });

  app.patch('/me', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'DATOS_INVALIDOS',
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
      });
    }

    const [actualizado] = await getDb()
      .update(users)
      .set({ victoryMessage: parsed.data.victoryMessage })
      .where(eq(users.id, request.user!.id))
      .returning();

    return toCurrentUserWithEquipped(actualizado!);
  });
};
