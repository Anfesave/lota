import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { poolConfigFor, sslOptionsFor } from './db/index.js';

describe('servidor http', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /health no consulta la base de datos', async () => {
    // Si tocara la BD, sin Postgres levantado esta llamada tardaria o fallaria.
    const inicio = Date.now();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(Date.now() - inicio).toBeLessThan(500);
  });

  it('una ruta de API inexistente responde 404 en JSON', async () => {
    // Las rutas que no son de API caen en el fallback de la SPA, asi que su
    // respuesta depende de si hay build; eso lo cubren los tests e2e.
    const res = await app.inject({ method: 'GET', url: '/api/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('configuracion de conexion a Postgres', () => {
  it('no usa TLS contra el Postgres local', () => {
    expect(sslOptionsFor('postgres://lota:lota@localhost:5432/lota')).toBe(false);
  });

  it('verifica el certificado contra Neon', () => {
    const url = 'postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/lota?sslmode=require';
    expect(sslOptionsFor(url)).toEqual({ rejectUnauthorized: true });
  });

  it('usa un pool pequeno y tolerante al despertar de Neon', () => {
    const config = poolConfigFor('postgres://u:p@ep-x-pooler.neon.tech/lota?sslmode=require');
    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBeGreaterThanOrEqual(10_000);
  });
});

describe('cadena de conexion', () => {
  it('quita sslmode de la cadena porque el TLS se fija aparte', async () => {
    const { poolConfigFor } = await import('./db/index.js');
    const config = poolConfigFor('postgres://u:p@ep-x.neon.tech/lota?sslmode=require');
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
});
