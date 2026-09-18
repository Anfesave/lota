import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MAX_PLAYERS, type CurrentUser, type LobbyStateView } from '@lota/shared';
import { App } from '../App.js';
import { t } from '../i18n/es-CL.js';
import { useAuthStore } from '../stores/auth.js';
import { resetLobbyListeners, useLobbyStore } from '../stores/lobby.js';
import { resetSocket } from '../lib/socket.js';
import { socketFalso } from '../test/socketFalso.js';

vi.mock('socket.io-client', async () => {
  const { socketFalso: falso } = await import('../test/socketFalso.js');
  return { io: () => falso };
});

const YO: CurrentUser = {
  id: 'usuario-1',
  username: 'don_pepe',
  victoryMessage: 'Se cayó la lota',
  coins: 40,
  createdAt: new Date('2026-01-01').toISOString(),
  equipped: {},
};

const OTRO = { userId: 'usuario-2', username: 'la_juanita' };

function estadoDeSala(cambios: Partial<LobbyStateView> = {}): LobbyStateView {
  return {
    id: 'sala-1',
    code: 'K7P2QX',
    name: 'Fonda dieciochera',
    hostId: YO.id,
    visibility: 'PUBLIC',
    requiresPassword: false,
    status: 'WAITING',
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
      { ...OTRO, ready: false, connected: true, isHost: false, equipped: {} },
    ],
    maxPlayers: MAX_PLAYERS,
    drawn: [],
    yourCards: [],
    yourMarks: [],
    lineWinnerIds: [],
    winnerIds: [],
    ...cambios,
  };
}

/** Respuestas de la API REST que necesita la pantalla de sala. */
function simularApi(opciones: { requiresPassword?: boolean } = {}) {
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
              requiresPassword: opciones.requiresPassword ?? false,
              players: 2,
              maxPlayers: MAX_PLAYERS,
              status: 'WAITING',
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

function renderizar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  socketFalso.limpiar();
  resetSocket();
  resetLobbyListeners();
  useAuthStore.setState({ user: null, estado: 'cargando', errorSesion: null });
  useLobbyStore.setState({ estado: null, mensajes: [], aviso: null, conectado: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('entrar a una sala', () => {
  it('entra directo si la sala no pide contraseña', async () => {
    simularApi();
    socketFalso.respuestas.set('lobby:join', { ok: true, data: estadoDeSala() });
    renderizar('/sala/K7P2QX');

    expect(await screen.findByRole('heading', { name: 'Fonda dieciochera' })).toBeInTheDocument();
    expect(screen.getByText('K7P2QX')).toBeInTheDocument();

    const unirse = socketFalso.emitidos.find((e) => e.evento === 'lobby:join');
    expect(unirse?.payload).toEqual({ code: 'K7P2QX' });
  });

  it('pide la contraseña antes de entrar si la sala es privada', async () => {
    simularApi({ requiresPassword: true });
    socketFalso.respuestas.set('lobby:join', { ok: true, data: estadoDeSala() });
    renderizar('/sala/K7P2QX');

    expect(await screen.findByRole('heading', { name: t.sala.pideContrasena })).toBeInTheDocument();
    // No se intenta entrar a ciegas.
    expect(socketFalso.emitidos.some((e) => e.evento === 'lobby:join')).toBe(false);

    await userEvent.type(screen.getByLabelText(t.lobby.contrasenaSala), 'porotos');
    await userEvent.click(screen.getByRole('button', { name: t.sala.entrar }));

    await waitFor(() => {
      const unirse = socketFalso.emitidos.find((e) => e.evento === 'lobby:join');
      expect(unirse?.payload).toEqual({ code: 'K7P2QX', password: 'porotos' });
    });
  });

  it('muestra el error si la contraseña es incorrecta y deja reintentar', async () => {
    simularApi({ requiresPassword: true });
    socketFalso.respuestas.set('lobby:join', {
      ok: false,
      error: { code: 'PASSWORD_INCORRECTA', message: 'Contraseña incorrecta.' },
    });
    renderizar('/sala/K7P2QX');

    await userEvent.type(await screen.findByLabelText(t.lobby.contrasenaSala), 'garbanzos');
    await userEvent.click(screen.getByRole('button', { name: t.sala.entrar }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Contraseña incorrecta.');
    expect(screen.getByLabelText(t.lobby.contrasenaSala)).toBeInTheDocument();
  });

  it('avisa cuando la sala ya no existe', async () => {
    simularApi();
    socketFalso.respuestas.set('lobby:join', {
      ok: false,
      error: { code: 'SALA_NO_EXISTE', message: 'Esa sala no existe.' },
    });
    renderizar('/sala/ZZZZZZ');

    expect(await screen.findByRole('alert')).toHaveTextContent('Esa sala no existe.');
  });
});

describe('dentro de la sala', () => {
  async function entrar(estado = estadoDeSala()) {
    simularApi();
    socketFalso.respuestas.set('lobby:join', { ok: true, data: estado });
    renderizar('/sala/K7P2QX');
    await screen.findByRole('heading', { name: estado.name });
  }

  it('lista a los jugadores y marca al anfitrión', async () => {
    await entrar();

    expect(screen.getByText(YO.username)).toBeInTheDocument();
    expect(screen.getByText(OTRO.username)).toBeInTheDocument();
    expect(screen.getByText(t.sala.anfitrion)).toBeInTheDocument();
  });

  it('el anfitrión puede cambiar la configuración', async () => {
    await entrar();

    await userEvent.selectOptions(screen.getByLabelText(t.sala.cartonesPorJugador), '3');

    const cambio = socketFalso.emitidos.find((e) => e.evento === 'lobby:updateSettings');
    expect(cambio?.payload).toEqual({ cardsPerPlayer: 3 });
  });

  it('a quien no es anfitrión le sale la configuración bloqueada', async () => {
    await entrar(estadoDeSala({ hostId: OTRO.userId }));

    expect(screen.getByLabelText(t.sala.cartonesPorJugador)).toBeDisabled();
    expect(screen.getByText(t.sala.soloAnfitrion)).toBeInTheDocument();
    // Y tampoco puede expulsar a nadie.
    expect(screen.queryByRole('button', { name: t.sala.expulsar })).not.toBeInTheDocument();
  });

  it('marcar listo avisa al servidor', async () => {
    await entrar();

    await userEvent.click(screen.getByRole('button', { name: t.sala.marcarListo }));

    const listo = socketFalso.emitidos.find((e) => e.evento === 'lobby:ready');
    expect(listo?.payload).toEqual({ ready: true });
  });

  it('el estado que llega por socket se refleja en pantalla', async () => {
    await entrar();

    const conListo = estadoDeSala();
    conListo.players[1]!.ready = true;
    socketFalso.servidorEmite('lobby:state', conListo);

    await waitFor(() => expect(screen.getByText(t.sala.listo)).toBeInTheDocument());
  });

  it('el chat manda el mensaje y muestra lo que llega', async () => {
    await entrar();

    await userEvent.type(screen.getByLabelText(t.sala.escribeMensaje), 'buenas');
    await userEvent.click(screen.getByRole('button', { name: t.sala.enviar }));

    const enviado = socketFalso.emitidos.find((e) => e.evento === 'chat:send');
    expect(enviado?.payload).toEqual({ text: 'buenas' });

    socketFalso.servidorEmite('chat:message', {
      id: 'm1',
      userId: OTRO.userId,
      username: OTRO.username,
      text: 'hola a todos',
      sentAt: new Date().toISOString(),
    });

    expect(await screen.findByText('hola a todos')).toBeInTheDocument();
  });

  it('una expulsión devuelve al listado con el motivo', async () => {
    await entrar();

    socketFalso.servidorEmite('lobby:kicked', { reason: t.sala.teExpulsaron });

    expect(await screen.findByRole('alert')).toHaveTextContent(t.sala.teExpulsaron);
    expect(screen.getByRole('heading', { name: t.lobby.titulo })).toBeInTheDocument();
  });

  it('un reinicio del servidor no deja la pantalla congelada', async () => {
    // Cada deploy de Render borra las salas en memoria (PLAN.md 12.4).
    await entrar();

    socketFalso.servidorEmite('server:shutdown', { reason: t.sala.servidorReiniciado });

    expect(await screen.findByRole('alert')).toHaveTextContent(t.sala.servidorReiniciado);
    expect(screen.getByRole('heading', { name: t.lobby.titulo })).toBeInTheDocument();
  });
});
