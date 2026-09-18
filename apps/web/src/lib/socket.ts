import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from '@lota/shared';
import { io, type Socket } from 'socket.io-client';

export type LotaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: LotaSocket | undefined;

/**
 * Socket único para toda la aplicación. La sesión viaja en la cookie del
 * handshake, así que no hay que mandar ningún token: el servidor rechaza la
 * conexión si no hay sesión válida.
 */
export function getSocket(): LotaSocket {
  socket ??= io({
    path: '/socket.io',
    withCredentials: true,
    autoConnect: false,
    // Render apaga el servicio tras 15 min sin tráfico; al volver hay que
    // reintentar con paciencia en vez de rendirse al primer fallo.
    reconnectionAttempts: 10,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
  });
  return socket;
}

/**
 * Conecta el socket si hace falta.
 *
 * Llamar a `connect()` mientras la conexión anterior todavía está en marcha
 * abre una **segunda** sesión de engine.io: el servidor descarta los paquetes
 * de la que pierde y el evento se pierde sin acuse. Pasaba al cargar
 * `/sala/<code>` de cero, porque el layout y la pantalla de sala conectaban a
 * la vez. `active` es true desde el primer `connect()`, así que sirve de guarda.
 */
export function conectarSocket(): LotaSocket {
  const actual = getSocket();
  if (!actual.active && !actual.connected) actual.connect();
  return actual;
}

export function resetSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = undefined;
}

/**
 * Cuánto se espera un acuse antes de rendirse. Con el arranque en frío de
 * Render el servidor puede tardar, pero quedarse esperando para siempre deja
 * la pantalla congelada, que es justo lo que hay que evitar (PLAN.md 12.4).
 */
const TIEMPO_MAXIMO_ACK_MS = 20_000;

/** Emite un evento y espera el acuse de recibo del servidor. */
export function emitirConAck<T = undefined>(
  evento: keyof ClientToServerEvents,
  payload?: unknown,
): Promise<AckResponse<T>> {
  const actual = conectarSocket();

  return new Promise((resolve) => {
    const temporizador = setTimeout(() => {
      resolve({
        ok: false,
        error: { code: 'SIN_RESPUESTA', message: 'El servidor no respondió. Intenta de nuevo.' },
      });
    }, TIEMPO_MAXIMO_ACK_MS);

    const recibir = (respuesta: AckResponse<T>) => {
      clearTimeout(temporizador);
      resolve(respuesta);
    };

    // `lobby:leave` no lleva payload: su único argumento es el acuse.
    if (payload === undefined) actual.emit(evento as 'lobby:leave', recibir as never);
    else actual.emit(evento as 'lobby:ready', payload as never, recibir as never);
  });
}
