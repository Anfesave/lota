import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  COINS_DAILY_BONUS,
  DAILY_COINS_CAP,
  coinsForFullCard,
  isValidBet,
  splitPrize,
} from '@lota/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import { closeDb, getDb } from '../db/index.js';
import { coinTransactions, cosmetics, userCosmetics, users } from '../db/schema.js';
import { grantCoins, spendCoins } from './coins.js';
import { buyCosmetic, seedCosmetics } from './cosmetics.js';

const CLAVE = 'unaClaveSegura1';

let app: FastifyInstance;
let contador = 0;

interface Sesion {
  userId: string;
  cookie: string;
}

async function crearUsuario(): Promise<Sesion> {
  contador += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: `comprador_${contador}`,
      password: CLAVE,
      victoryMessage: 'Gané',
    },
  });
  if (res.statusCode !== 201) throw new Error(`no se pudo registrar: ${res.body}`);

  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  return { userId: res.json().id, cookie: `${cookie.name}=${cookie.value}` };
}

async function saldo(userId: string): Promise<number> {
  const [fila] = await getDb()
    .select({ coins: users.coins })
    .from(users)
    .where(eq(users.id, userId));
  return fila?.coins ?? 0;
}

/** Un cosmético de pago cualquiera, para las compras. */
async function cosmeticoDePago(precio: number) {
  const [fila] = await getDb().select().from(cosmetics).where(eq(cosmetics.price, precio)).limit(1);
  if (!fila) throw new Error(`no hay cosmético de ${precio} monedas en el catálogo`);
  return fila;
}

beforeAll(async () => {
  app = await buildApp();
  await seedCosmetics();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

afterEach(async () => {
  await getDb().execute(sql`truncate table ${users} cascade`);
});

describe('cuentas de monedas', () => {
  it('splitPrize reparte redondeando hacia arriba', () => {
    expect(splitPrize(50, 1)).toBe(50);
    expect(splitPrize(50, 3)).toBe(17);
    expect(splitPrize(0, 2)).toBe(0);
    expect(splitPrize(50, 0)).toBe(0);
  });

  it('el cartón lleno paga más con más rivales', () => {
    expect(coinsForFullCard(1)).toBe(50);
    expect(coinsForFullCard(2)).toBe(60);
    expect(coinsForFullCard(10)).toBe(140);
  });

  it('solo acepta apuestas múltiplo de 500', () => {
    expect(isValidBet(0)).toBe(true);
    expect(isValidBet(500)).toBe(true);
    expect(isValidBet(1500)).toBe(true);
    expect(isValidBet(750)).toBe(false);
    expect(isValidBet(-500)).toBe(false);
    expect(isValidBet(500.5)).toBe(false);
  });
});

describe('libro contable', () => {
  it('cada movimiento deja su apunte', async () => {
    const { userId } = await crearUsuario();

    await grantCoins(userId, 120, 'GAME_WIN');
    expect(await saldo(userId)).toBe(120);

    const apuntes = await getDb()
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId));

    expect(apuntes).toHaveLength(1);
    expect(apuntes[0]).toMatchObject({ amount: 120, reason: 'GAME_WIN' });
  });

  it('no se puede gastar lo que no se tiene', async () => {
    const { userId } = await crearUsuario();
    await grantCoins(userId, 50, 'ADMIN');

    expect(await spendCoins(userId, 80, 'PURCHASE')).toBe(false);
    expect(await saldo(userId)).toBe(50);
  });
});

describe('compras concurrentes', () => {
  it('cuatro compras a la vez con saldo para una sola dejan el saldo en cero', async () => {
    // Es la garantía que pide el plan: el `where coins >= precio` lo decide
    // Postgres, así que las carreras no pueden dejar deuda.
    const { userId } = await crearUsuario();
    const caro = await cosmeticoDePago(1000);
    await grantCoins(userId, caro.price, 'ADMIN');

    const intentos = await Promise.allSettled(
      Array.from({ length: 4 }, () => buyCosmetic(userId, caro.id)),
    );

    const exitosas = intentos.filter((r) => r.status === 'fulfilled').length;
    expect(exitosas).toBe(1);
    expect(await saldo(userId)).toBe(0);
  });

  it('comprar dos cosas distintas sin saldo para ambas deja el saldo en positivo', async () => {
    const { userId } = await crearUsuario();
    const uno = await cosmeticoDePago(1000);
    const otro = await cosmeticoDePago(800);
    await grantCoins(userId, 1000, 'ADMIN');

    await Promise.allSettled([buyCosmetic(userId, uno.id), buyCosmetic(userId, otro.id)]);

    const restante = await saldo(userId);
    expect(restante).toBeGreaterThanOrEqual(0);

    // Y lo que tenga comprado cuadra con lo gastado.
    const comprados = await getDb()
      .select({ cosmeticId: userCosmetics.cosmeticId })
      .from(userCosmetics)
      .where(eq(userCosmetics.userId, userId));

    const gastado = 1000 - restante;
    const precios = { [uno.id]: uno.price, [otro.id]: otro.price };
    const sumaPrecios = comprados.reduce((total, c) => total + (precios[c.cosmeticId] ?? 0), 0);
    expect(sumaPrecios).toBe(gastado);
  });
});

describe('tope diario y bono', () => {
  it('no se pueden ganar más de 500 monedas al día en partidas', async () => {
    const { userId } = await crearUsuario();
    const { capDailyWinnings } = await import('./coins.js');

    await grantCoins(userId, DAILY_COINS_CAP - 20, 'GAME_WIN');

    // Solo caben las 20 que faltan, aunque el premio sea mayor.
    expect(await capDailyWinnings(userId, 100)).toBe(20);

    await grantCoins(userId, 20, 'GAME_WIN');
    expect(await capDailyWinnings(userId, 100)).toBe(0);
  });

  it('el bono diario no cuenta para el tope', async () => {
    const { userId } = await crearUsuario();
    const { capDailyWinnings } = await import('./coins.js');

    await grantCoins(userId, COINS_DAILY_BONUS, 'DAILY_BONUS');
    expect(await capDailyWinnings(userId, 100)).toBe(100);
  });

  it('se da una sola vez al día', async () => {
    const sesion = await crearUsuario();
    const { hasClaimedDailyBonus } = await import('./coins.js');

    expect(await hasClaimedDailyBonus(sesion.userId)).toBe(false);

    const primerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: `comprador_${contador}`, password: CLAVE },
    });
    expect(primerLogin.statusCode).toBe(200);
    expect(primerLogin.json().coins).toBe(COINS_DAILY_BONUS);
    expect(await hasClaimedDailyBonus(sesion.userId)).toBe(true);

    const segundoLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: `comprador_${contador}`, password: CLAVE },
    });
    expect(segundoLogin.json().coins).toBe(COINS_DAILY_BONUS);
  });
});

describe('tienda por HTTP', () => {
  let sesion: Sesion;

  beforeEach(async () => {
    sesion = await crearUsuario();
  });

  it('lista el catálogo con el saldo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/shop',
      headers: { cookie: sesion.cookie },
    });

    expect(res.statusCode).toBe(200);
    const tienda = res.json();
    expect(tienda.coins).toBe(0);
    expect(tienda.cosmetics.length).toBeGreaterThan(10);
    // Los gratis cuentan como propios desde el principio.
    expect(
      tienda.cosmetics
        .filter((c: { price: number }) => c.price === 0)
        .every((c: { owned: boolean }) => c.owned),
    ).toBe(true);
  });

  it('comprar sin saldo responde 402', async () => {
    const caro = await cosmeticoDePago(1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/shop/buy',
      headers: { cookie: sesion.cookie },
      payload: { cosmeticId: caro.id },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('SALDO_INSUFICIENTE');
  });

  it('comprar y equipar deja el cosmético puesto', async () => {
    const cosmetico = await cosmeticoDePago(200);
    await grantCoins(sesion.userId, 500, 'ADMIN');

    const compra = await app.inject({
      method: 'POST',
      url: '/api/shop/buy',
      headers: { cookie: sesion.cookie },
      payload: { cosmeticId: cosmetico.id },
    });
    expect(compra.statusCode).toBe(200);
    expect(compra.json().coins).toBe(300);

    const equipar = await app.inject({
      method: 'POST',
      url: '/api/cosmetics/equip',
      headers: { cookie: sesion.cookie },
      payload: { cosmeticId: cosmetico.id },
    });
    expect(equipar.statusCode).toBe(200);

    const yo = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: sesion.cookie },
    });
    expect(yo.json().equipped[cosmetico.type]).toBe(cosmetico.slug);
  });

  it('no se puede equipar lo que no se tiene', async () => {
    const caro = await cosmeticoDePago(1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/cosmetics/equip',
      headers: { cookie: sesion.cookie },
      payload: { cosmeticId: caro.id },
    });

    expect(res.statusCode).toBe(404);
  });

  it('la tienda exige sesión', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/shop' });
    expect(res.statusCode).toBe(401);
  });
});
