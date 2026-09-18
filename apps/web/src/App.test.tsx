import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App.js';
import { t } from './i18n/es-CL.js';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'ok' })))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra el nombre de la aplicacion', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: t.app.nombre })).toBeInTheDocument();
    // Esperar el resultado de /health evita un aviso de act() al desmontar.
    await screen.findByText(t.estado.servidorOk);
  });

  it('reporta el servidor conectado cuando /health responde', async () => {
    render(<App />);
    expect(await screen.findByText(t.estado.servidorOk)).toBeInTheDocument();
  });
});
