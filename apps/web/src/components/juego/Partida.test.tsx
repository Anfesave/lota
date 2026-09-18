import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  MAX_PLAYERS,
  cardNumbers,
  type Card,
  type CurrentUser,
  type LobbyStateView,
} from '@lota/shared';
import { App } from '../../App.js';
import { t } from '../../i18n/es-CL.js';
import { resetSocket } from '../../lib/socket.js';
import { useAuthStore } from '../../stores/auth.js';
import { resetLobbyListeners, useLobbyStore } from '../../stores/lobby.js';
import { socketFalso } from '../../test/socketFalso.js';

vi.mock('socket.io-client', async () => {
  const { socketFalso: falso } = await import('../../test/socketFalso.js');
  return { io: () => falso };
});

const YO: CurrentUser = {
  id: 'usuario-1',
  username: 'don_pepe',
  victoryMessage: 'Se cayó la lota',
  coins: 0,
  createdAt: new Date('2026-01-01').toISOString(),
  equipped: {},
};

/** Cartón fijo: así los tests pueden nombrar números concretos. */
const CARTON: Card = [
  [1, null, 20, null, 40, null, 60, null, 80],
  [null, 11, null, 30, null, 50, null, 70, 81],
  [2, 12, 21, null, 41, null, null, null, null],
];
const FILA_0 = [1, 20, 40, 60, 80];
const TODOS = cardNumbers(CARTON);

function estadoEnJuego(cambios: Partial<LobbyStateView> = {}): LobbyStateView {
  return {
    id: 'sala-1',
    code: 'K7P2QX',
    name: 'Fonda dieciochera',
    hostId: YO.id,
    visibility: 'PUBLIC',
    requiresPassword: false,
    status: 'PLAYING',
    settings: {
      cardsPerPlayer: 1,
      callIntervalMs: 5000,
      prizeMode: 'LINEA_Y_CARTON',
      autoMark: false,
      dichos: false,
    },
    players: [
      {
        userId: YO.id,
        username: YO.username,
        ready: false,
        connected: true,
        isHost: true,
        equipped: {},
      },
    ],
    maxPlayers: MAX_PLAYERS,
    drawn: [],
    yourCards: [CARTON],
    yourMarks: [],
    lineWinnerIds: [],
    winnerIds: [],
    ...cambios,
  };
}

function simularApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const cuerpo = url.endsWith('/me')
        ? YO
        : url.includes('/lobbies/')
          ? {
              code: 'K7P2QX',
              name: 'Fonda dieciochera',
              requiresPassword: false,
              players: 1,
              maxPlayers: MAX_PLAYERS,
              status: 'PLAYING',
            }
          : { lobbies: [] };

      return Promise.resolve(
        new Response(JSON.stringify(cuerpo), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

/** Entra a la sala con la partida ya en curso. */
async function entrarEnPartida(estado = estadoEnJuego()) {
  simularApi();
  socketFalso.respuestas.set('lobby:join', { ok: true, data: estado });
  render(
    <MemoryRouter initialEntries={['/sala/K7P2QX']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('group', { name: t.partida.cartonNumero(1) });
}

beforeEach(() => {
  socketFalso.limpiar();
  resetSocket();
  resetLobbyListeners();
  useAuthStore.setState({ user: null, estado: 'cargando', errorSesion: null });
  useLobbyStore.setState({
    estado: null,
    mensajes: [],
    aviso: null,
    conectado: false,
    cuentaAtras: null,
    ultimoNumero: null,
    ganadoresLinea: [],
    final: null,
    rechazo: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('cuenta regresiva', () => {
  it('muestra los segundos que faltan', async () => {
    simularApi();
    socketFalso.respuestas.set('lobby:join', {
      ok: true,
      data: estadoEnJuego({ status: 'COUNTDOWN' }),
    });
    render(
      <MemoryRouter initialEntries={['/sala/K7P2QX']}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Fonda dieciochera' });
    socketFalso.servidorEmite('game:countdown', { seconds: 3 });

    expect(await screen.findByText(t.partida.comienzaEn(3))).toBeInTheDocument();
  });
});

describe('tablero y bola', () => {
  it('muestra el número cantado y lo resalta en el tablero', async () => {
    await entrarEnPartida();

    socketFalso.servidorEmite('game:numberCalled', {
      number: 40,
      index: 1,
      calledAt: new Date().toISOString(),
    });
    socketFalso.servidorEmite('lobby:state', estadoEnJuego({ drawn: [40] }));

    expect(await screen.findByTestId('bola-actual')).toHaveTextContent('40');

    const tablero = screen.getByRole('region', { name: t.partida.tablero });
    await waitFor(() =>
      expect(within(tablero).getByText('40')).toHaveAttribute('data-cantado', 'si'),
    );
    expect(within(tablero).getByText('41')).toHaveAttribute('data-cantado', 'no');
  });
});

describe('marcar', () => {
  it('marca un número del cartón y avisa al servidor', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: [40] }));

    const carton = screen.getByRole('group', { name: t.partida.cartonNumero(1) });
    await userEvent.click(within(carton).getByRole('button', { name: '40' }));

    const marca = socketFalso.emitidos.find((e) => e.evento === 'game:mark');
    expect(marca?.payload).toEqual({ cardIndex: 0, number: 40 });
  });

  it('con marcado automático las casillas no son pulsables', async () => {
    const estado = estadoEnJuego({ drawn: [40], yourMarks: [40] });
    estado.settings.autoMark = true;
    await entrarEnPartida(estado);

    const carton = screen.getByRole('group', { name: t.partida.cartonNumero(1) });
    expect(within(carton).getByRole('button', { name: '40' })).toBeDisabled();
    expect(screen.getByText(t.partida.autoMarcadoActivo)).toBeInTheDocument();
  });

  it('refleja las marcas que llegan en el estado', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: [40], yourMarks: [40] }));

    const carton = screen.getByRole('group', { name: t.partida.cartonNumero(1) });
    expect(within(carton).getByRole('button', { name: '40' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(carton).getByRole('button', { name: '41' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('cantar', () => {
  it('el botón de lota manda el claim', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: TODOS }));

    await userEvent.click(screen.getByRole('button', { name: t.partida.cantarLota }));

    const claim = socketFalso.emitidos.find((e) => e.evento === 'game:claim');
    expect(claim?.payload).toEqual({ type: 'FULL', cardIndex: 0 });
  });

  it('una lota rechazada explica el motivo y bloquea los botones', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: FILA_0 }));

    socketFalso.servidorEmite('game:claimRejected', {
      type: 'FULL',
      reason: 'A ese cartón todavía le faltan números.',
      blockedUntil: Date.now() + 10_000,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('le faltan números');
    await waitFor(() => expect(screen.getByRole('button', { name: /Espera/ })).toBeDisabled());
  });

  it('avisa cuando alguien gana la línea, sin terminar la partida', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: FILA_0 }));

    socketFalso.servidorEmite('game:lineWon', {
      winners: [
        {
          userId: 'usuario-2',
          username: 'la_juanita',
          victoryMessage: 'Gané',
          equipped: {},
          card: CARTON,
          coinsWon: 0,
        },
      ],
    });

    expect(await screen.findByText(t.partida.lineaGanada('la_juanita'))).toBeInTheDocument();
    // La partida sigue: los cartones y el botón de lota continúan ahí.
    expect(screen.getByRole('button', { name: t.partida.cantarLota })).toBeInTheDocument();
  });

  it('en una sala de solo cartón lleno no hay botón de línea', async () => {
    const estado = estadoEnJuego({ drawn: FILA_0 });
    estado.settings.prizeMode = 'CARTON_LLENO';
    await entrarEnPartida(estado);

    expect(screen.queryByRole('button', { name: t.partida.cantarLinea })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.partida.cantarLota })).toBeInTheDocument();
  });

  it('la línea ya cantada deshabilita su botón', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: FILA_0, lineWinnerIds: ['usuario-2'] }));

    expect(screen.getByRole('button', { name: t.partida.lineaYaGanada })).toBeDisabled();
  });
});

describe('pantalla de victoria', () => {
  it('la ven todos, con el mensaje de victoria y el cartón ganador', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: TODOS }));

    socketFalso.servidorEmite('game:finished', {
      reason: 'LOTA',
      drawn: TODOS,
      winners: [
        {
          userId: 'usuario-2',
          username: 'la_juanita',
          victoryMessage: 'Se cayó la lota, compadre',
          equipped: {},
          card: CARTON,
          coinsWon: 0,
        },
      ],
    });

    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t.victoria.titulo)).toBeInTheDocument();
    expect(within(overlay).getByText('la_juanita')).toBeInTheDocument();
    expect(within(overlay).getByText(/Se cayó la lota, compadre/)).toBeInTheDocument();
    expect(within(overlay).getByText(t.victoria.cartonGanador)).toBeInTheDocument();
  });

  it('un empate muestra a los dos ganadores', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: TODOS }));

    const ganador = (userId: string, username: string) => ({
      userId,
      username,
      victoryMessage: `Gané yo, ${username}`,
      equipped: {},
      card: CARTON,
      coinsWon: 0,
    });

    socketFalso.servidorEmite('game:finished', {
      reason: 'LOTA',
      drawn: TODOS,
      winners: [ganador('u2', 'la_juanita'), ganador('u3', 'el_tito')],
    });

    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t.victoria.tituloEmpate)).toBeInTheDocument();
    expect(within(overlay).getByText('la_juanita')).toBeInTheDocument();
    expect(within(overlay).getByText('el_tito')).toBeInTheDocument();
  });

  it('si se acaba el bolillero sin ganador lo dice', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: TODOS }));

    socketFalso.servidorEmite('game:finished', {
      reason: 'BOLSA_VACIA',
      drawn: TODOS,
      winners: [],
    });

    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t.victoria.sinGanador)).toBeInTheDocument();
  });

  it('volver a la sala cierra el overlay', async () => {
    await entrarEnPartida(estadoEnJuego({ drawn: TODOS }));

    socketFalso.servidorEmite('game:finished', { reason: 'LOTA', drawn: TODOS, winners: [] });
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: t.victoria.volverALaSala }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
