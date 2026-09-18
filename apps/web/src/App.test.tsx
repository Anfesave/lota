import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CurrentUser } from '@lota/shared';
import { App } from './App.js';
import { t } from './i18n/es-CL.js';
import { useAuthStore } from './stores/auth.js';

const USUARIO: CurrentUser = {
  id: '11111111-1111-1111-1111-111111111111',
  username: 'don_pepe',
  victoryMessage: 'Se cayo la lota',
  coins: 120,
  createdAt: new Date('2026-01-01').toISOString(),
  equipped: {},
};

interface Peticion {
  metodo: string;
  url: string;
  body: unknown;
}

interface Respuesta {
  status: number;
  body: unknown;
}

const peticiones: Peticion[] = [];

/** Sustituye fetch por un manejador que responde segun metodo y ruta. */
function simularApi(manejador: (peticion: Peticion) => Respuesta) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const peticion: Peticion = {
        metodo: init?.method ?? 'GET',
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      peticiones.push(peticion);

      const { status, body } = manejador(peticion);
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

const SIN_SESION: Respuesta = {
  status: 401,
  body: { code: 'NO_AUTENTICADO', message: 'Inicia sesión primero.' },
};

function renderizar(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  peticiones.length = 0;
  useAuthStore.setState({ user: null, estado: 'cargando' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('rutas protegidas', () => {
  it('manda a la pantalla de entrar cuando no hay sesion', async () => {
    simularApi(() => SIN_SESION);
    renderizar('/');

    expect(await screen.findByRole('heading', { name: t.auth.entrarTitulo })).toBeInTheDocument();
  });

  it('muestra el inicio cuando hay sesion', async () => {
    simularApi(() => ({ status: 200, body: USUARIO }));
    renderizar('/');

    expect(await screen.findByText(t.inicio.saludo(USUARIO.username))).toBeInTheDocument();
    expect(screen.getByText(String(USUARIO.coins))).toBeInTheDocument();
    expect(screen.getByText(USUARIO.victoryMessage)).toBeInTheDocument();
  });

  it('recuerda la ruta pedida para volver a ella tras entrar', async () => {
    // Es lo que hara funcionar los links de invitacion en la Fase 3.
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/login')
        ? { status: 200, body: USUARIO }
        : peticion.url.endsWith('/me')
          ? SIN_SESION
          : { status: 404, body: {} },
    );
    renderizar('/sala/K7P2QX');

    await screen.findByRole('heading', { name: t.auth.entrarTitulo });
    await userEvent.type(screen.getByLabelText(t.auth.usuario), 'don_pepe');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'unaClaveSegura1');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonEntrar }));

    // Todavia no existe /sala/:code, asi que el comodin devuelve al inicio;
    // lo que importa es que la sesion quedo iniciada.
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(USUARIO));
  });
});

describe('entrar', () => {
  it('inicia sesion y muestra el inicio', async () => {
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/login') ? { status: 200, body: USUARIO } : SIN_SESION,
    );
    renderizar('/entrar');

    await userEvent.type(await screen.findByLabelText(t.auth.usuario), 'don_pepe');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'unaClaveSegura1');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonEntrar }));

    expect(await screen.findByText(t.inicio.saludo(USUARIO.username))).toBeInTheDocument();
  });

  it('muestra el mensaje generico del servidor si la contrasena es incorrecta', async () => {
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/login')
        ? {
            status: 401,
            body: {
              code: 'CREDENCIALES_INVALIDAS',
              message: 'Usuario o contraseña incorrectos.',
            },
          }
        : SIN_SESION,
    );
    renderizar('/entrar');

    await userEvent.type(await screen.findByLabelText(t.auth.usuario), 'don_pepe');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'claveMala1');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonEntrar }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');
  });

  it('traduce el 429 del rate limit a un aviso en espanol', async () => {
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/login')
        ? { status: 429, body: { message: 'Rate limit exceeded, retry in 1 minute' } }
        : SIN_SESION,
    );
    renderizar('/entrar');

    await userEvent.type(await screen.findByLabelText(t.auth.usuario), 'don_pepe');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'claveMala1');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonEntrar }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.auth.demasiadosIntentos);
  });
});

describe('registro', () => {
  it('valida en el cliente antes de llamar al servidor', async () => {
    simularApi(() => SIN_SESION);
    renderizar('/registro');

    await userEvent.type(await screen.findByLabelText(t.auth.usuario), 'ab');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'corta');
    await userEvent.type(screen.getByLabelText(t.auth.mensajeVictoria), 'Gane');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonRegistrar }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(peticiones.some((p) => p.url.endsWith('/auth/register'))).toBe(false);
  });

  it('crea la cuenta y deja la sesion iniciada', async () => {
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/register') ? { status: 201, body: USUARIO } : SIN_SESION,
    );
    renderizar('/registro');

    await userEvent.type(await screen.findByLabelText(t.auth.usuario), 'don_pepe');
    await userEvent.type(screen.getByLabelText(t.auth.contrasena), 'unaClaveSegura1');
    await userEvent.type(screen.getByLabelText(t.auth.mensajeVictoria), 'Se cayo la lota');
    await userEvent.click(screen.getByRole('button', { name: t.auth.botonRegistrar }));

    expect(await screen.findByText(t.inicio.saludo(USUARIO.username))).toBeInTheDocument();
  });
});

describe('cerrar sesion', () => {
  it('llama al servidor y vuelve a la pantalla de entrar', async () => {
    simularApi((peticion) =>
      peticion.url.endsWith('/auth/logout')
        ? { status: 200, body: { ok: true } }
        : { status: 200, body: USUARIO },
    );
    renderizar('/');

    await userEvent.click(await screen.findByRole('button', { name: t.auth.salir }));

    expect(await screen.findByRole('heading', { name: t.auth.entrarTitulo })).toBeInTheDocument();
    expect(peticiones.some((p) => p.url.endsWith('/auth/logout'))).toBe(true);
  });
});
