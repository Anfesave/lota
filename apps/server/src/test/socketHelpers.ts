import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AckResponse, LobbyStateView } from '@lota/shared';
import { buildApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import { closeDb, getDb } from '../db/index.js';
import { users } from '../db/schema.js';

const CLAVE = 'unaClaveSegura1';

export interface Sesion {
  userId: string;
  username: string;
  cookie: string;
}

export interface Recolector<T> {
  /** Resuelve con el primer evento (ya recibido o futuro) que cumpla la condición. */
  esperarQue(predicado: (valor: T) => boolean, ms?: number): Promise<T>;
  recibidos: T[];
}

export interface OpcionesSala {
  visibility?: 'PUBLIC' | 'PRIVATE';
  password?: string;
  name?: string;
  settings?: Record<string, unknown>;
}

/**
 * Utilidades para los tests que hablan con sockets de verdad: levantan la app,
 * crean usuarios con sesión y abren clientes socket.io contra el puerto real.
 */
export function crearAyudantes() {
  let app: FastifyInstance;
  let urlBase = '';
  const abiertos: ClientSocket[] = [];
  let contador = 0;

  async function iniciar(): Promise<FastifyInstance> {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    urlBase = `http://127.0.0.1:${port}`;
    return app;
  }

  async function cerrar(): Promise<void> {
    await app.close();
    await closeDb();
  }

  /** Cierra los sockets del test y deja la base y las salas limpias. */
  async function limpiar(): Promise<void> {
    for (const socket of abiertos) socket.disconnect();
    abiertos.length = 0;
    for (const lobby of app.lobbies.all()) app.games.stop(lobby.id);
    app.lobbies.clear();
    await getDb().execute(sql`truncate table ${users} cascade`);
  }

  async function crearUsuario(): Promise<Sesion> {
    contador += 1;
    const username = `jugador_${contador}`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password: CLAVE, victoryMessage: `Gané yo, ${username}` },
    });
    if (res.statusCode !== 201) throw new Error(`no se pudo registrar: ${res.body}`);

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    if (!cookie) throw new Error('el registro no devolvió cookie');

    return { userId: res.json().id, username, cookie: `${cookie.name}=${cookie.value}` };
  }

  function conectar(cookie: string | undefined): Promise<ClientSocket> {
    const socket = ioClient(urlBase, {
      path: '/socket.io',
      transports: ['websocket'],
      ...(cookie ? { extraHeaders: { cookie } } : {}),
      reconnection: false,
    });
    abiertos.push(socket);

    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (error) => reject(error));
    });
  }

  /** Emite un evento y espera su acuse de recibo. */
  function emitir<T = undefined>(
    socket: ClientSocket,
    evento: string,
    payload?: unknown,
  ): Promise<AckResponse<T>> {
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => reject(new Error(`sin acuse de ${evento}`)), 5_000);
      const recibir = (respuesta: AckResponse<T>) => {
        clearTimeout(temporizador);
        resolve(respuesta);
      };
      if (payload === undefined) socket.emit(evento, recibir);
      else socket.emit(evento, payload, recibir);
    });
  }

  /**
   * Empieza a escuchar un evento desde ya y guarda lo que llegue. Registrar el
   * listener justo después de disparar la acción es una carrera perdida: el
   * evento puede haber llegado antes.
   */
  function recolectar<T>(socket: ClientSocket, evento: string): Recolector<T> {
    const recibidos: T[] = [];
    const pendientes: { predicado: (valor: T) => boolean; resolver: (valor: T) => void }[] = [];

    socket.on(evento, (payload: T) => {
      recibidos.push(payload);
      for (let i = pendientes.length - 1; i >= 0; i--) {
        const pendiente = pendientes[i]!;
        if (pendiente.predicado(payload)) {
          pendientes.splice(i, 1);
          pendiente.resolver(payload);
        }
      }
    });

    return {
      recibidos,
      esperarQue(predicado, ms = 5_000) {
        const yaLlego = recibidos.find(predicado);
        if (yaLlego !== undefined) return Promise.resolve(yaLlego);

        return new Promise((resolve, reject) => {
          const temporizador = setTimeout(
            () => reject(new Error(`ningún ${evento} cumplió la condición`)),
            ms,
          );
          pendientes.push({
            predicado,
            resolver: (valor) => {
              clearTimeout(temporizador);
              resolve(valor);
            },
          });
        });
      },
    };
  }

  function esperarEvento<T>(socket: ClientSocket, evento: string, ms = 5_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => reject(new Error(`no llegó ${evento}`)), ms);
      socket.once(evento, (payload: T) => {
        clearTimeout(temporizador);
        resolve(payload);
      });
    });
  }

  /** Crea la sala por REST y mete al anfitrión por socket. */
  async function crearSala(
    sesion: Sesion,
    opciones: OpcionesSala = {},
  ): Promise<{ code: string; socket: ClientSocket; estado: LobbyStateView }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/lobbies',
      headers: { cookie: sesion.cookie },
      payload: {
        name: opciones.name ?? 'Sala de prueba',
        visibility: opciones.visibility ?? 'PUBLIC',
        ...(opciones.password ? { password: opciones.password } : {}),
        ...(opciones.settings ? { settings: opciones.settings } : {}),
      },
    });
    if (res.statusCode !== 201) throw new Error(`no se pudo crear la sala: ${res.body}`);

    const { code } = res.json<{ code: string }>();
    const socket = await conectar(sesion.cookie);

    const entrada = await emitir<LobbyStateView>(socket, 'lobby:join', {
      code,
      ...(opciones.password ? { password: opciones.password } : {}),
    });
    if (!entrada.ok) throw new Error(`el anfitrión no pudo entrar: ${entrada.error.message}`);

    return { code, socket, estado: entrada.data };
  }

  /** Mete a un jugador nuevo en una sala ya creada. */
  async function entrarEnSala(code: string, password?: string) {
    const sesion = await crearUsuario();
    const socket = await conectar(sesion.cookie);
    const entrada = await emitir<LobbyStateView>(socket, 'lobby:join', {
      code,
      ...(password ? { password } : {}),
    });
    if (!entrada.ok) throw new Error(`no pudo entrar: ${entrada.error.message}`);
    return { sesion, socket, estado: entrada.data };
  }

  return {
    iniciar,
    cerrar,
    limpiar,
    crearUsuario,
    conectar,
    emitir,
    recolectar,
    esperarEvento,
    crearSala,
    entrarEnSala,
    get app() {
      return app;
    },
  };
}
