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

export function resetSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = undefined;
}

/** Emite un evento y espera el acuse de recibo del servidor. */
export function emitirConAck<T = undefined>(
  evento: keyof ClientToServerEvents,
  payload?: unknown,
): Promise<AckResponse<T>> {
  const actual = getSocket();

  return new Promise((resolve) => {
    const recibir = (respuesta: AckResponse<T>) => resolve(respuesta);
    // `lobby:leave` no lleva payload: su único argumento es el acuse.
    if (payload === undefined) actual.emit(evento as 'lobby:leave', recibir as never);
    else actual.emit(evento as 'lobby:ready', payload as never, recibir as never);
  });
}
