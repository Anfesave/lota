import {
  COINS_FULL_CARD,
  COINS_LINE,
  COINS_PARTICIPATION,
  MIN_PLAYERS_FOR_COINS,
  splitPrize,
  type GameFinished,
  type GameHistoryEntry,
  type WinnerView,
} from '@lota/shared';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { gamePlayers, games } from '../db/schema.js';
import { toWinnerViews } from '../game/engine.js';
import { recordLobbyTally } from '../lobby/service.js';
import type { Lobby } from '../lobby/types.js';
import { capDailyWinnings, grantCoins } from './coins.js';

/** Suma de lo que anotó cada jugador. Es un registro, no dinero movido. */
export function potOf(lobby: Lobby): number {
  let total = 0;
  for (const jugador of lobby.players.values()) total += jugador.bet;
  return total;
}

/**
 * Cierra la partida: reparte monedas, calcula el pozo y la guarda en el
 * historial. Devuelve a los ganadores ya con sus premios, para la pantalla de
 * victoria.
 *
 * Nada de esto puede tumbar la partida: si la base falla, se registra y los
 * jugadores igual ven quién ganó.
 */
export interface SettleResult {
  winners: WinnerView[];
  /** Monedas por jugador, incluidos los que no ganaron. */
  coinsByUser: Record<string, number>;
}

export async function settleGame(
  lobby: Lobby,
  reason: GameFinished['reason'],
  log: (error: unknown, mensaje: string) => void,
): Promise<SettleResult> {
  const ganadores = toWinnerViews(lobby, lobby.winnerIds);
  const pozo = potOf(lobby);

  // Anti-farmeo: jugar solo no da monedas (PLAN.md sección 9). Una partida
  // cancelada tampoco reparte nada.
  const reparteMonedas = reason !== 'CANCELADA' && lobby.players.size >= MIN_PLAYERS_FOR_COINS;

  // El pozo se lo llevan quienes cantaron lota. Si nadie ganó no se reparte:
  // cada uno se queda con lo suyo.
  const pozoPorGanador = lobby.winnerIds.length > 0 ? splitPrize(pozo, lobby.winnerIds.length) : 0;

  /** Monedas efectivamente otorgadas, ya recortadas por el tope diario. */
  const monedasPorJugador = new Map<string, number>();

  try {
    for (const jugador of lobby.players.values()) {
      if (!reparteMonedas) {
        monedasPorJugador.set(jugador.userId, 0);
        continue;
      }

      const ganoCarton = lobby.winnerIds.includes(jugador.userId);
      const ganoLinea = lobby.lineWinnerIds.includes(jugador.userId);

      // Los premios de cartón y línea se reparten entre quienes empataron; la
      // participación no se divide, le toca entera a cada uno.
      const porCarton = ganoCarton
        ? splitPrize(COINS_FULL_CARD, lobby.winnerIds.length)
        : COINS_PARTICIPATION;
      const porLinea = ganoLinea ? splitPrize(COINS_LINE, lobby.lineWinnerIds.length) : 0;

      monedasPorJugador.set(
        jugador.userId,
        await capDailyWinnings(jugador.userId, porCarton + porLinea),
      );
    }
  } catch (error) {
    log(error, 'no se pudo calcular el reparto de monedas');
  }

  for (const ganador of ganadores) {
    ganador.coinsWon = monedasPorJugador.get(ganador.userId) ?? 0;
    ganador.potWon = pozoPorGanador;
  }

  // La cuenta de la sala se apunta aunque falle la base: es el papelito de la
  // mesa y tiene que cuadrar con lo que acaban de ver en pantalla.
  if (reason !== 'CANCELADA') recordLobbyTally(lobby, pozoPorGanador);

  try {
    await persistir(lobby, reason, pozo, monedasPorJugador, pozoPorGanador);
  } catch (error) {
    log(error, 'no se pudo guardar la partida');
  }

  return { winners: ganadores, coinsByUser: Object.fromEntries(monedasPorJugador) };
}

/** Motivo del apunte contable segun como termino el jugador. */
function motivoDe(lobby: Lobby, userId: string): 'GAME_WIN' | 'LINE_WIN' | 'GAME_PLAYED' {
  if (lobby.winnerIds.includes(userId)) return 'GAME_WIN';
  if (lobby.lineWinnerIds.includes(userId)) return 'LINE_WIN';
  return 'GAME_PLAYED';
}

async function persistir(
  lobby: Lobby,
  reason: GameFinished['reason'],
  pozo: number,
  monedas: Map<string, number>,
  pozoPorGanador: number,
): Promise<void> {
  // Una partida cancelada o sin números cantados no vale la pena guardarla.
  if (reason === 'CANCELADA' || lobby.drawn.length === 0) return;

  const db = getDb();

  const [partida] = await db
    .insert(games)
    .values({
      hostId: lobby.hostId,
      settings: lobby.settings,
      drawnNumbers: lobby.drawn,
      pot: pozo,
      startedAt: new Date(lobby.createdAt),
    })
    .returning({ id: games.id });

  if (!partida) return;

  const filas = [...lobby.players.values()].map((jugador) => ({
    gameId: partida.id,
    userId: jugador.userId,
    cards: jugador.cards,
    result: lobby.winnerIds.includes(jugador.userId)
      ? ('WIN_FULL' as const)
      : lobby.lineWinnerIds.includes(jugador.userId)
        ? ('WIN_LINE' as const)
        : ('NONE' as const),
    coinsWon: monedas.get(jugador.userId) ?? 0,
    bet: jugador.bet,
    potWon: lobby.winnerIds.includes(jugador.userId) ? pozoPorGanador : 0,
  }));

  if (filas.length > 0) await db.insert(gamePlayers).values(filas);

  // Las monedas se abonan una vez guardada la partida, para que la referencia
  // del libro contable apunte a algo que existe.
  for (const [userId, cantidad] of monedas) {
    if (cantidad <= 0) continue;
    await grantCoins(userId, cantidad, motivoDe(lobby, userId), partida.id);
  }
}

/** Últimas partidas del usuario, para el perfil. */
export async function getHistory(userId: string, limite = 20): Promise<GameHistoryEntry[]> {
  const filas = await getDb()
    .select({
      gameId: games.id,
      playedAt: games.endedAt,
      result: gamePlayers.result,
      coinsWon: gamePlayers.coinsWon,
      bet: gamePlayers.bet,
      potWon: gamePlayers.potWon,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(eq(gamePlayers.userId, userId))
    .orderBy(desc(games.endedAt))
    .limit(limite);

  // Cuántos jugaron cada una, para dar contexto a la fila.
  const conteos = new Map<string, number>();
  for (const fila of filas) {
    if (conteos.has(fila.gameId)) continue;
    const jugadores = await getDb()
      .select({ userId: gamePlayers.userId })
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, fila.gameId));
    conteos.set(fila.gameId, jugadores.length);
  }

  return filas.map((fila) => ({
    gameId: fila.gameId,
    playedAt: fila.playedAt.toISOString(),
    players: conteos.get(fila.gameId) ?? 0,
    result: fila.result,
    coinsWon: fila.coinsWon,
    bet: fila.bet,
    potWon: fila.potWon,
  }));
}
