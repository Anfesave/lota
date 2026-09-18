import {
  COSMETIC_CATALOG,
  type CosmeticData,
  type CosmeticView,
  type ShopView,
} from '@lota/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { cosmetics, userCosmetics, userEquipped, users } from '../db/schema.js';
import { LobbyOperationError } from '../lobby/service.js';
import { spendCoins } from './coins.js';

/** Inserta o actualiza los cosméticos de salida. Idempotente. */
export async function seedCosmetics(): Promise<void> {
  await getDb()
    .insert(cosmetics)
    .values(COSMETIC_CATALOG)
    .onConflictDoUpdate({
      target: cosmetics.slug,
      // `excluded` es la fila que se intentó insertar: así cambiar un precio
      // aquí lo actualiza, sin tocar lo que la gente ya compró.
      set: {
        name: sql`excluded.name`,
        price: sql`excluded.price`,
        rarity: sql`excluded.rarity`,
        data: sql`excluded.data`,
        active: sql`excluded.active`,
      },
    });
}

export async function getEquipped(userId: string): Promise<Record<string, string>> {
  const filas = await getDb()
    .select({ type: userEquipped.type, slug: cosmetics.slug })
    .from(userEquipped)
    .innerJoin(cosmetics, eq(userEquipped.cosmeticId, cosmetics.id))
    .where(eq(userEquipped.userId, userId));

  return Object.fromEntries(filas.map((fila) => [fila.type, fila.slug]));
}

/** Tienda: todos los cosméticos activos, marcando cuáles tiene y lleva puestos. */
export async function getShop(userId: string): Promise<ShopView> {
  const db = getDb();

  const [saldo] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId));
  const filas = await db
    .select({ cosmetic: cosmetics, owned: userCosmetics.userId, equipped: userEquipped.userId })
    .from(cosmetics)
    .leftJoin(
      userCosmetics,
      and(eq(userCosmetics.cosmeticId, cosmetics.id), eq(userCosmetics.userId, userId)),
    )
    .leftJoin(
      userEquipped,
      and(eq(userEquipped.cosmeticId, cosmetics.id), eq(userEquipped.userId, userId)),
    )
    .where(eq(cosmetics.active, true))
    .orderBy(asc(cosmetics.type), asc(cosmetics.price));

  const vistas: CosmeticView[] = filas.map(({ cosmetic, owned, equipped }) => ({
    id: cosmetic.id,
    slug: cosmetic.slug,
    name: cosmetic.name,
    type: cosmetic.type,
    price: cosmetic.price,
    rarity: cosmetic.rarity,
    data: cosmetic.data as CosmeticData,
    // Los gratis cuentan como propios: son el punto de partida de todos.
    owned: owned !== null || cosmetic.price === 0,
    equipped: equipped !== null,
  }));

  return { coins: saldo?.coins ?? 0, cosmetics: vistas };
}

export async function buyCosmetic(userId: string, cosmeticId: string): Promise<void> {
  const db = getDb();

  const [cosmetico] = await db
    .select()
    .from(cosmetics)
    .where(and(eq(cosmetics.id, cosmeticId), eq(cosmetics.active, true)))
    .limit(1);

  if (!cosmetico) {
    throw new LobbyOperationError('COSMETICO_NO_EXISTE', 'Ese cosmético no existe.');
  }

  const [yaLoTiene] = await db
    .select({ userId: userCosmetics.userId })
    .from(userCosmetics)
    .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.cosmeticId, cosmeticId)))
    .limit(1);

  if (yaLoTiene || cosmetico.price === 0) {
    throw new LobbyOperationError('YA_LO_TIENES', 'Ya tienes ese cosmético.');
  }

  // El descuento lo decide Postgres: dos compras a la vez no pueden dejar el
  // saldo negativo.
  const alcanzo = await spendCoins(userId, cosmetico.price, 'PURCHASE', cosmetico.id);
  if (!alcanzo) {
    throw new LobbyOperationError('SALDO_INSUFICIENTE', 'No te alcanzan las monedas.');
  }

  // Si dos peticiones idénticas pasan el descuento, la segunda no duplica fila;
  // el cobro doble lo evita la comprobación de arriba en la práctica.
  await db.insert(userCosmetics).values({ userId, cosmeticId }).onConflictDoNothing();
}

export async function equipCosmetic(userId: string, cosmeticId: string): Promise<void> {
  const db = getDb();

  const [cosmetico] = await db
    .select()
    .from(cosmetics)
    .where(and(eq(cosmetics.id, cosmeticId), eq(cosmetics.active, true)))
    .limit(1);

  if (!cosmetico) {
    throw new LobbyOperationError('COSMETICO_NO_EXISTE', 'Ese cosmético no existe.');
  }

  if (cosmetico.price > 0) {
    const [loTiene] = await db
      .select({ userId: userCosmetics.userId })
      .from(userCosmetics)
      .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.cosmeticId, cosmeticId)))
      .limit(1);

    if (!loTiene) {
      throw new LobbyOperationError('COSMETICO_NO_EXISTE', 'Todavía no tienes ese cosmético.');
    }
  }

  // Uno por tipo: equipar reemplaza al anterior.
  await db
    .insert(userEquipped)
    .values({ userId, type: cosmetico.type, cosmeticId })
    .onConflictDoUpdate({
      target: [userEquipped.userId, userEquipped.type],
      set: { cosmeticId },
    });
}
