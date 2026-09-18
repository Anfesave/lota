import type { AckResponse, ChatMessage, LobbySettings, LobbyStateView } from '@lota/shared';
import { create } from 'zustand';
import { emitirConAck, getSocket } from '../lib/socket.js';

interface LobbyStoreState {
  conectado: boolean;
  estado: LobbyStateView | null;
  mensajes: ChatMessage[];
  /** Motivo por el que se salió de la sala sin quererlo (expulsión, reinicio). */
  aviso: string | null;

  escuchar: () => void;
  entrar: (code: string, password?: string) => Promise<AckResponse<LobbyStateView>>;
  salir: () => Promise<void>;
  marcarListo: (ready: boolean) => Promise<AckResponse>;
  cambiarConfig: (cambios: Partial<LobbySettings>) => Promise<AckResponse>;
  expulsar: (userId: string) => Promise<AckResponse>;
  enviarChat: (text: string) => Promise<AckResponse>;
  limpiarAviso: () => void;
  olvidarSala: () => void;
}

let escuchando = false;

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  conectado: false,
  estado: null,
  mensajes: [],
  aviso: null,

  /** Engancha los listeners una sola vez y conecta el socket. */
  escuchar() {
    const socket = getSocket();

    if (!escuchando) {
      escuchando = true;

      socket.on('connect', () => set({ conectado: true }));
      socket.on('disconnect', () => set({ conectado: false }));

      socket.on('lobby:state', (estado) => set({ estado }));
      socket.on('chat:history', ({ messages }) => set({ mensajes: messages }));
      socket.on('chat:message', (mensaje) =>
        set((anterior) => ({ mensajes: [...anterior.mensajes, mensaje] })),
      );

      socket.on('lobby:kicked', ({ reason }) => set({ estado: null, aviso: reason }));

      // Cada deploy o reinicio de Render borra las salas en memoria: hay que
      // sacar al jugador con un aviso, no dejar la pantalla congelada.
      socket.on('server:shutdown', ({ reason }) => set({ estado: null, aviso: reason }));
    }

    if (!socket.connected) socket.connect();
  },

  async entrar(code, password) {
    get().escuchar();

    const respuesta = await emitirConAck<LobbyStateView>('lobby:join', {
      code,
      ...(password ? { password } : {}),
    });
    if (respuesta.ok) set({ estado: respuesta.data, aviso: null });
    return respuesta;
  },

  async salir() {
    await emitirConAck('lobby:leave');
    set({ estado: null, mensajes: [] });
  },

  marcarListo: (ready) => emitirConAck('lobby:ready', { ready }),
  cambiarConfig: (cambios) => emitirConAck('lobby:updateSettings', cambios),
  expulsar: (userId) => emitirConAck('lobby:kick', { userId }),
  enviarChat: (text) => emitirConAck('chat:send', { text }),

  limpiarAviso: () => set({ aviso: null }),
  olvidarSala: () => set({ estado: null, mensajes: [] }),
}));

/** Solo para los tests: vuelve a permitir enganchar los listeners. */
export function resetLobbyListeners(): void {
  escuchando = false;
}
