import type {
  AckResponse,
  ChatMessage,
  ClaimRejected,
  ClaimType,
  GameFinished,
  LobbySettings,
  LobbyStateView,
  NumberCalled,
  PlayerCloseToWin,
  WinnerView,
} from '@lota/shared';
import { create } from 'zustand';
import { conectarSocket, emitirConAck, getSocket } from '../lib/socket.js';
import { useAuthStore } from './auth.js';

interface LobbyStoreState {
  conectado: boolean;
  estado: LobbyStateView | null;
  mensajes: ChatMessage[];
  /** Motivo por el que se salió de la sala sin quererlo (expulsión, reinicio). */
  aviso: string | null;

  // --- Partida ---
  /** Segundos de la cuenta atrás, o null si no hay ninguna en curso. */
  cuentaAtras: number | null;
  /** Último número cantado, para la bola grande. */
  ultimoNumero: NumberCalled | null;
  /**
   * Números cantados. Se siembra con `lobby:state` (entrada y reconexión) y se
   * va llenando con cada `game:numberCalled`: mandar el estado entero en cada
   * número sería caro y el plan define ese evento justo para esto.
   */
  cantados: number[];
  /** Mis marcas, con la misma lógica: estado al entrar, eventos después. */
  marcas: number[];
  ganadoresLinea: WinnerView[];
  final: GameFinished | null;
  /** Última lota rechazada, con el bloqueo que dejó. */
  rechazo: ClaimRejected | null;
  /** Aviso en pantalla de que a alguien le quedan pocos números. */
  cerca: PlayerCloseToWin | null;

  escuchar: () => void;
  entrar: (code: string, password?: string) => Promise<AckResponse<LobbyStateView>>;
  salir: () => Promise<void>;
  marcarListo: (ready: boolean) => Promise<AckResponse>;
  apostar: (amount: number) => Promise<AckResponse>;
  cambiarConfig: (cambios: Partial<LobbySettings>) => Promise<AckResponse>;
  expulsar: (userId: string) => Promise<AckResponse>;
  enviarChat: (text: string) => Promise<AckResponse>;

  empezar: () => Promise<AckResponse>;
  marcar: (cardIndex: number, number: number) => Promise<AckResponse>;
  cantar: (type: ClaimType, cardIndex: number) => Promise<AckResponse>;

  limpiarAviso: () => void;
  cerrarVictoria: () => void;
  limpiarRechazo: () => void;
  limpiarCerca: () => void;
  olvidarSala: () => void;
}

let escuchando = false;

/**
 * Sala en la que estamos, para poder volver a entrar sola tras una
 * reconexión. Al reconectar, el servidor crea un socket nuevo que no está en
 * ninguna sala: sin esto la pantalla se quedaba muda aunque el jugador
 * siguiera dentro. La contraseña se guarda solo en memoria.
 */
let salaActual: { code: string; password?: string } | null = null;

type EstadoPartida = Pick<
  LobbyStoreState,
  | 'cuentaAtras'
  | 'ultimoNumero'
  | 'cantados'
  | 'marcas'
  | 'ganadoresLinea'
  | 'final'
  | 'rechazo'
  | 'cerca'
>;

/** True si el número está en alguno de mis cartones. */
function enMisCartones(estado: LobbyStateView | null, numero: number): boolean {
  return (estado?.yourCards ?? []).some((carton) => carton.some((fila) => fila.includes(numero)));
}

/** Estado de partida en blanco. Es una función para no compartir el array. */
function sinPartida(): EstadoPartida {
  return {
    cuentaAtras: null,
    ultimoNumero: null,
    cantados: [],
    marcas: [],
    ganadoresLinea: [],
    final: null,
    rechazo: null,
    cerca: null,
  };
}

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  conectado: false,
  estado: null,
  mensajes: [],
  aviso: null,
  ...sinPartida(),

  /** Engancha los listeners una sola vez y conecta el socket. */
  escuchar() {
    const socket = getSocket();

    if (!escuchando) {
      escuchando = true;

      socket.on('connect', () => {
        set({ conectado: true });

        // Reconexión: volver a entrar a la sala sin molestar al jugador.
        if (salaActual) {
          void emitirConAck<LobbyStateView>('lobby:join', {
            code: salaActual.code,
            ...(salaActual.password ? { password: salaActual.password } : {}),
          }).then((respuesta) => {
            if (respuesta.ok) set({ estado: respuesta.data });
            // Si la sala ya no existe (reinicio de Render), el aviso lo manda
            // el servidor por `server:shutdown` o lo ve la pantalla de sala.
          });
        }
      });
      socket.on('disconnect', () => set({ conectado: false }));

      // El estado del servidor manda: resincroniza cantados y marcas.
      socket.on('lobby:state', (estado) =>
        set({ estado, cantados: estado.drawn, marcas: estado.yourMarks }),
      );
      socket.on('chat:history', ({ messages }) => set({ mensajes: messages }));
      socket.on('chat:message', (mensaje) =>
        set((anterior) => ({ mensajes: [...anterior.mensajes, mensaje] })),
      );

      socket.on('lobby:kicked', ({ reason }) => {
        salaActual = null;
        set({ estado: null, aviso: reason });
      });

      // Cada deploy o reinicio de Render borra las salas en memoria: hay que
      // sacar al jugador con un aviso, no dejar la pantalla congelada.
      socket.on('server:shutdown', ({ reason }) => {
        salaActual = null;
        set({ estado: null, aviso: reason });
      });

      socket.on('game:countdown', ({ seconds }) => set({ ...sinPartida(), cuentaAtras: seconds }));
      socket.on('game:started', () => set(sinPartida()));
      socket.on('game:numberCalled', (numero) =>
        set((anterior) => {
          const cantados = anterior.cantados.includes(numero.number)
            ? anterior.cantados
            : [...anterior.cantados, numero.number];

          // Con marcado automático el servidor ya lo marcó de su lado; aquí se
          // refleja sin esperar un estado completo.
          const marcaAutomatica =
            (anterior.estado?.settings.autoMark ?? false) &&
            enMisCartones(anterior.estado, numero.number) &&
            !anterior.marcas.includes(numero.number);

          return {
            cuentaAtras: null,
            ultimoNumero: numero,
            cantados,
            marcas: marcaAutomatica ? [...anterior.marcas, numero.number] : anterior.marcas,
          };
        }),
      );
      socket.on('game:lineWon', ({ winners }) => set({ ganadoresLinea: winners }));
      socket.on('game:finished', (final) => {
        set({ final });

        // Participar tambien paga: hay que refrescar el saldo de la cabecera
        // sin esperar a la siguiente consulta de /me.
        const { user, setUser } = useAuthStore.getState();
        const ganadas = user ? (final.coinsByUser?.[user.id] ?? 0) : 0;
        if (user && ganadas > 0) setUser({ ...user, coins: user.coins + ganadas });
      });
      socket.on('game:claimRejected', (rechazo) => set({ rechazo }));
      socket.on('game:playerClose', (cerca) => set({ cerca }));
    }

    conectarSocket();
  },

  async entrar(code, password) {
    get().escuchar();

    const respuesta = await emitirConAck<LobbyStateView>('lobby:join', {
      code,
      ...(password ? { password } : {}),
    });
    if (respuesta.ok) {
      salaActual = password === undefined ? { code } : { code, password };

      // Al reconectar en mitad de una partida el servidor devuelve los números
      // cantados y las marcas: hay que sembrarlos, no empezar de cero.
      set({
        ...sinPartida(),
        estado: respuesta.data,
        aviso: null,
        cantados: respuesta.data.drawn,
        marcas: respuesta.data.yourMarks,
      });
    }
    return respuesta;
  },

  async salir() {
    salaActual = null;
    await emitirConAck('lobby:leave');
    set({ estado: null, mensajes: [], ...sinPartida() });
  },

  marcarListo: (ready) => emitirConAck('lobby:ready', { ready }),
  apostar: (amount) => emitirConAck('lobby:setBet', { amount }),
  cambiarConfig: (cambios) => emitirConAck('lobby:updateSettings', cambios),
  expulsar: (userId) => emitirConAck('lobby:kick', { userId }),
  enviarChat: (text) => emitirConAck('chat:send', { text }),

  empezar: () => emitirConAck('game:start'),
  async marcar(cardIndex, number) {
    // Optimista: la ficha se pinta al tiro. Si el servidor la rechaza se quita.
    set((anterior) => ({
      marcas: anterior.marcas.includes(number) ? anterior.marcas : [...anterior.marcas, number],
    }));

    const respuesta = await emitirConAck('game:mark', { cardIndex, number });
    if (!respuesta.ok) {
      set((anterior) => ({ marcas: anterior.marcas.filter((n) => n !== number) }));
    }
    return respuesta;
  },
  cantar: (type, cardIndex) => emitirConAck('game:claim', { type, cardIndex }),

  limpiarAviso: () => set({ aviso: null }),
  cerrarVictoria: () => set({ final: null }),
  limpiarRechazo: () => set({ rechazo: null }),
  limpiarCerca: () => set({ cerca: null }),
  olvidarSala: () => {
    salaActual = null;
    set({ estado: null, mensajes: [], ...sinPartida() });
  },
}));

/** Solo para los tests: vuelve a permitir enganchar los listeners. */
export function resetLobbyListeners(): void {
  escuchando = false;
  salaActual = null;
}
