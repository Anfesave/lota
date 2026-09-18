import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import { hashSessionToken } from '../auth/sessions.js';
import { closeDb, getDb } from '../db/index.js';
import { sessions, users } from '../db/schema.js';

const CLAVE = 'unaClaveSegura1';

let app: FastifyInstance;

/**
 * El rate limit es por IP + usuario y su contador vive en la instancia de la
 * app, que compartimos entre tests. Con un nombre distinto cada vez, cada test
 * estrena su propio cupo y el limite se prueba solo donde toca.
 */
let contador = 0;
function nombreUnico(prefijo = 'jugador'): string {
  contador += 1;
  return `${prefijo}_${contador}`;
}

async function registrar(username: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: CLAVE, victoryMessage: 'Gane la lota', ...extra },
  });
}

function iniciarSesion(username: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
}

function cookieDeSesion(res: Awaited<ReturnType<typeof registrar>>): string {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!cookie) throw new Error(`la respuesta ${res.statusCode} no trae cookie de sesion`);
  return cookie.value;
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  // `cascade` limpia tambien las sesiones por la clave foranea.
  await getDb().execute(sql`truncate table ${users} cascade`);
});

describe('POST /api/auth/register', () => {
  it('crea el usuario, devuelve 201 y deja la sesion iniciada', async () => {
    const nombre = nombreUnico();
    const res = await registrar(nombre);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ username: nombre, coins: 0, equipped: {} });
    expect(res.json()).not.toHaveProperty('passwordHash');

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('rechaza un usuario duplicado sin distinguir mayusculas', async () => {
    const nombre = nombreUnico('DonPepe');
    expect((await registrar(nombre)).statusCode).toBe(201);

    const res = await registrar(nombre.toLowerCase());
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('USUARIO_EXISTE');
  });

  it('rechaza datos invalidos con 400', async () => {
    const res = await registrar('ab');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('DATOS_INVALIDOS');
  });

  it('nunca guarda la contrasena en claro', async () => {
    await registrar(nombreUnico());
    const [fila] = await getDb().select().from(users);
    expect(fila?.passwordHash).not.toContain(CLAVE);
    expect(fila?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('acepta las credenciales correctas', async () => {
    const nombre = nombreUnico();
    await registrar(nombre);

    const res = await iniciarSesion(nombre, CLAVE);
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(nombre);
  });

  it('acepta el nombre escrito con otras mayusculas', async () => {
    const nombre = nombreUnico();
    await registrar(nombre);

    const res = await iniciarSesion(nombre.toUpperCase(), CLAVE);
    expect(res.statusCode).toBe(200);
  });

  it('rechaza una contrasena incorrecta con un mensaje generico', async () => {
    const nombre = nombreUnico();
    await registrar(nombre);

    const res = await iniciarSesion(nombre, 'otraClaveDistinta1');
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Usuario o contrasena incorrectos.');
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('da la misma respuesta si el usuario no existe', async () => {
    // No debe filtrarse que usuarios estan registrados.
    const res = await iniciarSesion(nombreUnico('fantasma'), CLAVE);
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Usuario o contrasena incorrectos.');
  });

  it('corta al sexto intento fallido en un minuto', async () => {
    const nombre = nombreUnico();
    await registrar(nombre);

    for (let i = 0; i < 5; i++) {
      expect((await iniciarSesion(nombre, 'claveEquivocada1')).statusCode).toBe(401);
    }

    const bloqueado = await iniciarSesion(nombre, 'claveEquivocada1');
    expect(bloqueado.statusCode).toBe(429);
  });

  it('el bloqueo tambien alcanza a la contrasena correcta', async () => {
    // Si no, un atacante podria seguir probando mientras la victima entra.
    const nombre = nombreUnico();
    await registrar(nombre);

    for (let i = 0; i < 5; i++) await iniciarSesion(nombre, 'claveEquivocada1');

    expect((await iniciarSesion(nombre, CLAVE)).statusCode).toBe(429);
  });

  it('el limite es por usuario, no solo por IP', async () => {
    // Agotar los intentos de una cuenta no debe dejar fuera a otra.
    const victima = nombreUnico('victima');
    const otro = nombreUnico('otro');
    await registrar(victima);
    await registrar(otro);

    for (let i = 0; i < 6; i++) await iniciarSesion(victima, 'mala');

    expect((await iniciarSesion(otro, CLAVE)).statusCode).toBe(200);
  });
});

describe('GET /api/me', () => {
  it('responde 401 sin cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('devuelve el usuario con una sesion valida', async () => {
    const nombre = nombreUnico();
    const registro = await registrar(nombre);

    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION_COOKIE_NAME]: cookieDeSesion(registro) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(nombre);
  });

  it('responde 401 con una sesion vencida', async () => {
    const registro = await registrar(nombreUnico());
    const [usuario] = await getDb().select().from(users);

    const token = 'token-vencido-de-prueba';
    await getDb()
      .insert(sessions)
      .values({
        id: hashSessionToken(token),
        userId: usuario!.id,
        expiresAt: new Date(Date.now() - 1_000),
      });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION_COOKIE_NAME]: app.signCookie(token) },
    });
    expect(res.statusCode).toBe(401);

    // La sesion vigente sigue sirviendo: solo caduca la vencida.
    const vigente = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION_COOKIE_NAME]: cookieDeSesion(registro) },
    });
    expect(vigente.statusCode).toBe(200);
  });

  it('responde 401 con una cookie manipulada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION_COOKIE_NAME]: 'token-inventado.firma-falsa' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  it('cambia el mensaje de victoria', async () => {
    const registro = await registrar(nombreUnico());
    const cookies = { [SESSION_COOKIE_NAME]: cookieDeSesion(registro) };

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      cookies,
      payload: { victoryMessage: 'Se cayo la lota' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().victoryMessage).toBe('Se cayo la lota');
  });

  it('rechaza un mensaje demasiado largo', async () => {
    const registro = await registrar(nombreUnico());
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      cookies: { [SESSION_COOKIE_NAME]: cookieDeSesion(registro) },
      payload: { victoryMessage: 'a'.repeat(141) },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalida la sesion y borra la cookie', async () => {
    const registro = await registrar(nombreUnico());
    const cookies = { [SESSION_COOKIE_NAME]: cookieDeSesion(registro) };

    const salida = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
    expect(salida.statusCode).toBe(200);

    // La sesion ya no sirve aunque el cliente conserve la cookie.
    const res = await app.inject({ method: 'GET', url: '/api/me', cookies });
    expect(res.statusCode).toBe(401);
    expect(await getDb().select().from(sessions)).toHaveLength(0);
  });
});
