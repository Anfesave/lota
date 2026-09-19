import { DAILY_COINS_CAP } from '@lota/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { coinTransactions, users } from '../db/schema.js';

type Reason = (typeof coinTransactions.$inferInsert)['reason'];

/** Comienzo del día de hoy, para el tope diario y el bono. */
function inicioDelDia(ahora = new Date()): Date {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

/**
 * Suma monedas y deja constancia en el libro contable, todo en una
 * transacción: el saldo de `users.coins` nunca puede quedar sin su apunte.
 */
export async function grantCoins(
  userId: string,
  amount: number,
  reason: Reason,
  refId?: string,
): Promise<void> {
  if (amount <= 0) return;

  await getDb().transaction(async (tx) => {
    await tx.insert(coinTransactions).values({ userId, amount, reason, refId: refId ?? null });
    await tx
      .update(users)
      .set({ coins: sql`${users.coins} + ${amount}` })
      .where(eq(users.id, userId));
  });
}

/**
 * Cuántas monedas lleva ganadas hoy **en partidas**, incluida la
 * participación. El bono diario y las compras no cuentan para el tope
 * anti-farmeo.
 */
export async function coinsWonToday(userId: string, ahora = new Date()): Promise<number> {
  const [fila] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        gte(coinTransactions.createdAt, inicioDelDia(ahora)),
        sql`${coinTransactions.reason} in ('GAME_WIN', 'LINE_WIN', 'GAME_PLAYED')`,
      ),
    );

  return fila?.total ?? 0;
}

/**
 * Recorta un premio para no pasarse del tope diario. Devuelve lo que
 * realmente se puede dar, que puede ser 0.
 */
export async function capDailyWinnings(userId: string, premio: number): Promise<number> {
  if (premio <= 0) return 0;
  const yaGanado = await coinsWonToday(userId);
  return Math.max(0, Math.min(premio, DAILY_COINS_CAP - yaGanado));
}

/** True si el usuario ya cobró el bono de hoy. */
export async function hasClaimedDailyBonus(userId: string, ahora = new Date()): Promise<boolean> {
  const [fila] = await getDb()
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.reason, 'DAILY_BONUS'),
        gte(coinTransactions.createdAt, inicioDelDia(ahora)),
      ),
    )
    .limit(1);

  return fila !== undefined;
}

/**
 * Gasta monedas de forma segura ante carreras: el `where coins >= precio` lo
 * decide Postgres, así que dos compras simultáneas no pueden dejar el saldo
 * negativo (PLAN.md sección 4). Devuelve false si no alcanzaba.
 */
export async function spendCoins(
  userId: string,
  amount: number,
  reason: Reason,
  refId?: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  return getDb().transaction(async (tx) => {
    const descontados = await tx
      .update(users)
      .set({ coins: sql`${users.coins} - ${amount}` })
      .where(and(eq(users.id, userId), gte(users.coins, amount)))
      .returning({ id: users.id });

    if (descontados.length === 0) return false;

    await tx
      .insert(coinTransactions)
      .values({ userId, amount: -amount, reason, refId: refId ?? null });

    return true;
  });
}
