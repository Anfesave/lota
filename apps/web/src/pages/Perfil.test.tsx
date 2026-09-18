import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CurrentUser } from '@lota/shared';
import { App } from '../App.js';
import { t } from '../i18n/es-CL.js';
import { resetSocket } from '../lib/socket.js';
import { useAuthStore } from '../stores/auth.js';
import { resetLobbyListeners } from '../stores/lobby.js';
import { socketFalso } from '../test/socketFalso.js';

vi.mock('socket.io-client', async () => {
  const { socketFalso: falso } = await import('../test/socketFalso.js');
  return { io: () => falso };
});

const YO: CurrentUser = {
  id: 'usuario-1',
  username: 'don_pepe',
  victoryMessage: 'Se cayó la lota',
  coins: 340,
  createdAt: new Date('2026-01-01').toISOString(),
  equipped: { CARTON_THEME: 'carton-neon', TITLE: 'titulo-suertudo' },
};

interface Peticion {
  metodo: string;
  url: string;
  body: unknown;
}

const peticiones: Peticion[] = [];

function simularApi(opciones: { historial?: unknown[]; patchFalla?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const metodo = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      peticiones.push({ metodo, url, body });

      if (url.endsWith('/me') && metodo === 'PATCH') {
        if (opciones.patchFalla) {
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'DATOS_INVALIDOS', message: 'No se pudo.' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        const { victoryMessage } = body as { victoryMessage: string };
        return Promise.resolve(
          new Response(JSON.stringify({ ...YO, victoryMessage }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      const cuerpo = url.endsWith('/me')
        ? YO
        : url.endsWith('/me/history')
          ? { games: opciones.historial ?? [] }
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

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  peticiones.length = 0;
  socketFalso.limpiar();
  resetSocket();
  resetLobbyListeners();
  useAuthStore.setState({ user: null, estado: 'cargando', errorSesion: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('mensaje de victoria', () => {
  it('llega con el mensaje actual y lo puede cambiar', async () => {
    simularApi();
    renderizar();

    const campo = await screen.findByLabelText(t.perfil.tuMensaje);
    expect(campo).toHaveValue(YO.victoryMessage);

    await userEvent.clear(campo);
    await userEvent.type(campo, 'Se cayó la lota, compadre');
    await userEvent.click(screen.getByRole('button', { name: t.perfil.guardar }));

    await waitFor(() => {
      const patch = peticiones.find((p) => p.metodo === 'PATCH');
      expect(patch?.body).toEqual({ victoryMessage: 'Se cayó la lota, compadre' });
    });

    expect(await screen.findByText(t.perfil.guardado)).toBeInTheDocument();
    // La cabecera y el resto de la app ven el mensaje nuevo.
    expect(useAuthStore.getState().user?.victoryMessage).toBe('Se cayó la lota, compadre');
  });

  it('no deja guardar sin cambios', async () => {
    simularApi();
    renderizar();

    await screen.findByLabelText(t.perfil.tuMensaje);
    expect(screen.getByRole('button', { name: t.perfil.guardar })).toBeDisabled();
  });

  it('valida en el cliente antes de llamar al servidor', async () => {
    simularApi();
    renderizar();

    const campo = await screen.findByLabelText(t.perfil.tuMensaje);
    await userEvent.clear(campo);
    await userEvent.type(campo, '   ');
    await userEvent.click(screen.getByRole('button', { name: t.perfil.guardar }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === 'PATCH')).toBe(false);
  });

  it('muestra el error del servidor si lo rechaza', async () => {
    simularApi({ patchFalla: true });
    renderizar();

    const campo = await screen.findByLabelText(t.perfil.tuMensaje);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Otro mensaje');
    await userEvent.click(screen.getByRole('button', { name: t.perfil.guardar }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo.');
  });
});

describe('perfil', () => {
  it('lista lo que lleva equipado', async () => {
    simularApi();
    renderizar();

    expect(await screen.findByText('Neón')).toBeInTheDocument();
    expect(screen.getByText('Suertudo')).toBeInTheDocument();
  });

  it('muestra el historial de partidas', async () => {
    simularApi({
      historial: [
        {
          gameId: 'g1',
          playedAt: new Date('2026-09-18').toISOString(),
          players: 4,
          result: 'WIN_FULL',
          coinsWon: 80,
          bet: 1000,
          potWon: 4000,
        },
      ],
    });
    renderizar();

    expect(await screen.findByText(t.perfil.resultado.WIN_FULL)).toBeInTheDocument();
    expect(screen.getByText('+80')).toBeInTheDocument();
    expect(screen.getByText('$4.000')).toBeInTheDocument();
  });

  it('dice cuando todavía no hay partidas', async () => {
    simularApi({ historial: [] });
    renderizar();

    expect(await screen.findByText(t.perfil.sinHistorial)).toBeInTheDocument();
  });
});
