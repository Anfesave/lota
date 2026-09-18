import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { InMemoryLobbyStore, type LobbyStore } from './store.js';

declare module 'fastify' {
  interface FastifyInstance {
    lobbies: LobbyStore;
  }
}

/**
 * Registra el almacén de salas en la instancia de Fastify en vez de usar un
 * singleton de módulo, para que cada app de test tenga el suyo.
 *
 * El barrido periódico (desconectados y salas vacías) lo hace la capa de
 * sockets, que es la única que puede avisar a los clientes de lo que cambió.
 */
const lobbyPlugin: FastifyPluginAsync = async (app) => {
  app.decorate('lobbies', new InMemoryLobbyStore());
};

export default fp(lobbyPlugin, { name: 'lobbies' });
