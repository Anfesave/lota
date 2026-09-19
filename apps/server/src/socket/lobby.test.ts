import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { sql } from 'drizzle-orm';
import {
  DISCONNECT_GRACE_MS,
  LOBBY_EMPTY_TTL_MS,
  MAX_PLAYERS,
  type AckResponse,
  type ChatMessage,
  type LobbyStateView,
} from '@lota/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import { closeDb, getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { barrer } from './index.js';

const CLAVE = 'unaClaveSegura1';

let app: FastifyInstance;
let urlBase: string;

/** Sockets abiertos en el test actual, para cerrarlos pase lo que pase. */
const abiertos: ClientSocket[] = [];
let contador = 0;

interface Sesion {
  userId: string;
  username: string;
  cookie: string;
}

async function crearUsuario(): Promise<Sesion> {
  contador += 1;
  const username = `jugador_${contador}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: CLAVE, victoryMessage: 'Gané' },
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

interface Recolector<T> {
  /** Resuelve con el primer evento (ya recibido o futuro) que cumpla la condición. */
  esperarQue(predicado: (valor: T) => boolean, ms?: number): Promise<T>;
  recibidos: T[];
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
  opciones: { visibility?: 'PUBLIC' | 'PRIVATE'; password?: string; name?: string } = {},
): Promise<{ code: string; socket: ClientSocket; estado: LobbyStateView }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/lobbies',
    headers: { cookie: sesion.cookie },
    payload: {
      name: opciones.name ?? 'Sala de prueba',
      visibility: opciones.visibility ?? 'PUBLIC',
      ...(opciones.password ? { password: opciones.password } : {}),
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

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  urlBase = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

afterEach(async () => {
  for (const socket of abiertos) socket.disconnect();
  abiertos.length = 0;
  app.lobbies.clear();
  await getDb().execute(sql`truncate table ${users} cascade`);
});

describe('autenticación del socket', () => {
  it('rechaza la conexión sin cookie de sesión', async () => {
    await expect(conectar(undefined)).rejects.toThrow(/NO_AUTENTICADO/);
  });

  it('rechaza una cookie con firma inválida', async () => {
    await expect(conectar(`${SESSION_COOKIE_NAME}=inventada.firma`)).rejects.toThrow(
      /NO_AUTENTICADO/,
    );
  });

  it('acepta una sesión válida', async () => {
    const sesion = await crearUsuario();
    const socket = await conectar(sesion.cookie);
    expect(socket.connected).toBe(true);
  });
});

describe('crear y entrar a una sala', () => {
  it('el creador queda de anfitrión', async () => {
    const sesion = await crearUsuario();
    const { estado } = await crearSala(sesion);

    expect(estado.hostId).toBe(sesion.userId);
    expect(estado.players).toHaveLength(1);
    expect(estado.players[0]).toMatchObject({ username: sesion.username, isHost: true });
    expect(estado.status).toBe('WAITING');
  });

  it('avisa a los que ya estaban cuando entra alguien', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const aviso = esperarEvento<{ player: { username: string } }>(
      socketAnfitrion,
      'lobby:playerJoined',
    );

    const socketInvitado = await conectar(invitado.cookie);
    const entrada = await emitir<LobbyStateView>(socketInvitado, 'lobby:join', { code });

    expect(entrada.ok).toBe(true);
    expect((await aviso).player.username).toBe(invitado.username);
  });

  it('rechaza un código que no existe', async () => {
    const sesion = await crearUsuario();
    const socket = await conectar(sesion.cookie);

    const entrada = await emitir(socket, 'lobby:join', { code: 'ZZZZZZ' });

    expect(entrada.ok).toBe(false);
    if (!entrada.ok) expect(entrada.error.code).toBe('SALA_NO_EXISTE');
  });

  it(`rechaza al jugador ${MAX_PLAYERS + 1} porque la sala está llena`, async () => {
    const anfitrion = await crearUsuario();
    const { code } = await crearSala(anfitrion);

    // El anfitrión ya ocupa un sitio: faltan MAX_PLAYERS - 1 para llenarla.
    for (let i = 0; i < MAX_PLAYERS - 1; i++) {
      const sesion = await crearUsuario();
      const socket = await conectar(sesion.cookie);
      const entrada = await emitir(socket, 'lobby:join', { code });
      expect(entrada.ok).toBe(true);
    }

    const sobrante = await crearUsuario();
    const socketSobrante = await conectar(sobrante.cookie);
    const entrada = await emitir(socketSobrante, 'lobby:join', { code });

    expect(entrada.ok).toBe(false);
    if (!entrada.ok) expect(entrada.error.code).toBe('SALA_LLENA');
  });
});

describe('salas privadas', () => {
  it('rechaza la contraseña equivocada y acepta la correcta', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code } = await crearSala(anfitrion, { visibility: 'PRIVATE', password: 'porotos' });

    const socket = await conectar(invitado.cookie);

    const mala = await emitir(socket, 'lobby:join', { code, password: 'garbanzos' });
    expect(mala.ok).toBe(false);
    if (!mala.ok) expect(mala.error.code).toBe('PASSWORD_INCORRECTA');

    const sinClave = await emitir(socket, 'lobby:join', { code });
    expect(sinClave.ok).toBe(false);

    const buena = await emitir<LobbyStateView>(socket, 'lobby:join', { code, password: 'porotos' });
    expect(buena.ok).toBe(true);
    if (buena.ok) expect(buena.data.players).toHaveLength(2);
  });

  it('no aparece en el listado público, pero sí se puede consultar por código', async () => {
    const anfitrion = await crearUsuario();
    const { code } = await crearSala(anfitrion, { visibility: 'PRIVATE', password: 'porotos' });

    const listado = await app.inject({
      method: 'GET',
      url: '/api/lobbies',
      headers: { cookie: anfitrion.cookie },
    });
    expect(listado.json<{ lobbies: unknown[] }>().lobbies).toHaveLength(0);

    // El link de invitación tiene que poder mostrar que pide contraseña.
    const preview = await app.inject({
      method: 'GET',
      url: `/api/lobbies/${code}`,
      headers: { cookie: anfitrion.cookie },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ requiresPassword: true, players: 1 });
  });

  it('la contraseña nunca sale hacia el cliente', async () => {
    const anfitrion = await crearUsuario();
    const { estado } = await crearSala(anfitrion, {
      visibility: 'PRIVATE',
      password: 'porotos',
    });

    const serializado = JSON.stringify(estado);
    expect(serializado).not.toContain('porotos');
    expect(serializado).not.toContain('passwordHash');
    // La bolsa tampoco: el cliente no debe poder adivinar el sorteo.
    expect(serializado).not.toContain('"bag"');
    expect(estado.requiresPassword).toBe(true);
  });
});

describe('anfitrión desconectado', () => {
  it('el rol pasa al jugador más antiguo pasado el margen de gracia', async () => {
    const anfitrion = await crearUsuario();
    const segundo = await crearUsuario();
    const tercero = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketSegundo = await conectar(segundo.cookie);
    await emitir(socketSegundo, 'lobby:join', { code });
    const socketTercero = await conectar(tercero.cookie);
    await emitir(socketTercero, 'lobby:join', { code });

    const estados = recolectar<LobbyStateView>(socketSegundo, 'lobby:state');
    const cambios = recolectar<{ hostId: string }>(socketSegundo, 'lobby:hostChanged');

    socketAnfitrion.disconnect();
    // Esperamos a que el servidor registre la caída antes de mover el reloj.
    await estados.esperarQue((estado) =>
      estado.players.some((p) => p.userId === anfitrion.userId && !p.connected),
    );

    await barrer(app, app.io, Date.now() + DISCONNECT_GRACE_MS + 1);

    expect((await cambios.esperarQue(() => true)).hostId).toBe(segundo.userId);

    const estado = await estados.esperarQue((e) => e.hostId === segundo.userId);
    expect(estado.players.map((p) => p.userId)).not.toContain(anfitrion.userId);
  });

  it('antes del margen conserva su sitio, solo aparece desconectado', async () => {
    const anfitrion = await crearUsuario();
    const segundo = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketSegundo = await conectar(segundo.cookie);
    await emitir(socketSegundo, 'lobby:join', { code });

    const estados = recolectar<LobbyStateView>(socketSegundo, 'lobby:state');
    socketAnfitrion.disconnect();

    const estado = await estados.esperarQue((e) =>
      e.players.some((p) => p.userId === anfitrion.userId && !p.connected),
    );

    // Sigue siendo el anfitrión: solo pierde el sitio pasado el margen.
    expect(estado.hostId).toBe(anfitrion.userId);
  });

  it('una sala que se queda sin nadie se borra a los 2 minutos', async () => {
    const anfitrion = await crearUsuario();
    const { code, socket } = await crearSala(anfitrion);

    await emitir(socket, 'lobby:leave');
    expect(app.lobbies.getByCode(code)).toBeDefined();

    await barrer(app, app.io, Date.now() + LOBBY_EMPTY_TTL_MS + 1);
    expect(app.lobbies.getByCode(code)).toBeUndefined();
  });
});

describe('reconexión desde el teléfono', () => {
  it('volver a entrar tras caerse recupera el sitio sin perder la sala', async () => {
    // Cambiar de aplicación en el móvil suspende la página y cae el socket.
    // El servidor guarda el sitio el margen de gracia entero.
    const anfitrion = await crearUsuario();
    const segundo = await crearUsuario();
    const { code, socket } = await crearSala(anfitrion);

    const socketSegundo = await conectar(segundo.cookie);
    await emitir(socketSegundo, 'lobby:join', { code });
    await emitir(socketSegundo, 'lobby:ready', { ready: true });

    const estados = recolectar<LobbyStateView>(socket, 'lobby:state');
    socketSegundo.disconnect();
    await estados.esperarQue((e) =>
      e.players.some((p) => p.userId === segundo.userId && !p.connected),
    );

    // Vuelve antes de que se acabe el margen: sigue dentro y sigue listo.
    const otro = await conectar(segundo.cookie);
    const vuelta = await emitir<LobbyStateView>(otro, 'lobby:join', { code });

    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;

    const yo = vuelta.data.players.find((p) => p.userId === segundo.userId);
    expect(yo).toMatchObject({ connected: true, ready: true });
    expect(vuelta.data.players).toHaveLength(2);
  });

  it('una sala privada no vuelve a pedir la contraseña al reconectar', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code } = await crearSala(anfitrion, {
      visibility: 'PRIVATE',
      password: 'porotos',
    });

    const socket = await conectar(invitado.cookie);
    await emitir(socket, 'lobby:join', { code, password: 'porotos' });
    socket.disconnect();

    const otro = await conectar(invitado.cookie);
    const vuelta = await emitir(otro, 'lobby:join', { code });

    expect(vuelta.ok).toBe(true);
  });
});

describe('estado de la sala', () => {
  it('listo y no listo se propagan a todos', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });

    const llega = esperarEvento<LobbyStateView>(socketAnfitrion, 'lobby:state');
    await emitir(socketInvitado, 'lobby:ready', { ready: true });

    const estado = await llega;
    expect(estado.players.find((p) => p.userId === invitado.userId)?.ready).toBe(true);
  });

  it('solo el anfitrión cambia la configuración, y eso reinicia los listos', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });
    await emitir(socketInvitado, 'lobby:ready', { ready: true });

    const rechazado = await emitir(socketInvitado, 'lobby:updateSettings', { cardsPerPlayer: 3 });
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.error.code).toBe('NO_ERES_ANFITRION');

    const estados = recolectar<LobbyStateView>(socketInvitado, 'lobby:state');
    const cambios = recolectar<{ settings: { cardsPerPlayer: number } }>(
      socketInvitado,
      'lobby:settingsChanged',
    );

    const aceptado = await emitir(socketAnfitrion, 'lobby:updateSettings', { cardsPerPlayer: 3 });

    expect(aceptado.ok).toBe(true);
    expect((await cambios.esperarQue(() => true)).settings.cardsPerPlayer).toBe(3);

    // Nadie queda "listo" con reglas que no aceptó.
    const estado = await estados.esperarQue((e) => e.settings.cardsPerPlayer === 3);
    expect(estado.players.every((p) => !p.ready)).toBe(true);
  });

  it('rechaza una configuración fuera de rango', async () => {
    const anfitrion = await crearUsuario();
    const { socket } = await crearSala(anfitrion);

    const res = await emitir(socket, 'lobby:updateSettings', { cardsPerPlayer: 99 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('DATOS_INVALIDOS');
  });

  it('el anfitrión puede expulsar y el expulsado se entera', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });

    const expulsion = esperarEvento<{ reason: string }>(socketInvitado, 'lobby:kicked');
    const res = await emitir(socketAnfitrion, 'lobby:kick', { userId: invitado.userId });

    expect(res.ok).toBe(true);
    expect((await expulsion).reason).toBeTruthy();
    expect(app.lobbies.getByCode(code)?.players.has(invitado.userId)).toBe(false);
  });

  it('un jugador no puede expulsar a nadie', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code } = await crearSala(anfitrion);

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });

    const res = await emitir(socketInvitado, 'lobby:kick', { userId: anfitrion.userId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_ERES_ANFITRION');
  });
});

describe('chat', () => {
  it('reparte el mensaje a toda la sala', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });

    const llega = esperarEvento<ChatMessage>(socketAnfitrion, 'chat:message');
    await emitir(socketInvitado, 'chat:send', { text: 'buenas a todos' });

    const mensaje = await llega;
    expect(mensaje).toMatchObject({ username: invitado.username, text: 'buenas a todos' });
  });

  it('corta al segundo mensaje seguido', async () => {
    const anfitrion = await crearUsuario();
    const { socket } = await crearSala(anfitrion);

    expect((await emitir(socket, 'chat:send', { text: 'uno' })).ok).toBe(true);

    const segundo = await emitir(socket, 'chat:send', { text: 'dos' });
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error.code).toBe('DEMASIADO_RAPIDO');
  });

  it('rechaza mensajes vacíos o larguísimos', async () => {
    const anfitrion = await crearUsuario();
    const { socket } = await crearSala(anfitrion);

    const vacio = await emitir(socket, 'chat:send', { text: '   ' });
    expect(vacio.ok).toBe(false);

    const largo = await emitir(socket, 'chat:send', { text: 'a'.repeat(201) });
    expect(largo.ok).toBe(false);
  });

  it('quien entra recibe el historial reciente', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code, socket: socketAnfitrion } = await crearSala(anfitrion);

    await emitir(socketAnfitrion, 'chat:send', { text: 'primero' });

    const socketInvitado = await conectar(invitado.cookie);
    const historial = esperarEvento<{ messages: ChatMessage[] }>(socketInvitado, 'chat:history');
    await emitir(socketInvitado, 'lobby:join', { code });

    expect((await historial).messages.map((m) => m.text)).toEqual(['primero']);
  });

  it('no se puede escribir sin estar en una sala', async () => {
    const sesion = await crearUsuario();
    const socket = await conectar(sesion.cookie);

    const res = await emitir(socket, 'chat:send', { text: 'hola?' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_ESTAS_EN_SALA');
  });
});

describe('listado de salas públicas', () => {
  it('muestra la sala con su anfitrión y cuántos hay dentro', async () => {
    const anfitrion = await crearUsuario();
    const invitado = await crearUsuario();
    const { code } = await crearSala(anfitrion, { name: 'Fonda dieciochera' });

    const socketInvitado = await conectar(invitado.cookie);
    await emitir(socketInvitado, 'lobby:join', { code });

    const res = await app.inject({
      method: 'GET',
      url: '/api/lobbies',
      headers: { cookie: anfitrion.cookie },
    });

    expect(res.json().lobbies).toEqual([
      {
        code,
        name: 'Fonda dieciochera',
        hostUsername: anfitrion.username,
        players: 2,
        maxPlayers: MAX_PLAYERS,
      },
    ]);
  });

  it('exige sesión', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lobbies' });
    expect(res.statusCode).toBe(401);
  });
});
