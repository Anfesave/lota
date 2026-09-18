import {
  CLOSE_TO_WIN_THRESHOLDS,
  INVALID_CLAIM_BLOCK_MS,
  MIN_PLAYERS_TO_START,
  NUMBERS_PER_CARD,
  TIE_WINDOW_MS,
  cardKey,
  cardNumbers,
  checkFull,
  createBag,
  findCompletedLine,
  generateUniqueCards,
  pickLotero,
  type ClaimType,
  type PlayerCloseToWin,
  type RandomInt,
  type WinnerView,
} from '@lota/shared';
import { LobbyOperationError, isLobbyIdle, requireHost } from '../lobby/service.js';
import type { Lobby, LobbyPlayer } from '../lobby/types.js';

/**
 * Prepara la partida: reparte cartones y baraja el bolillero. No arranca el
 * locutor; de eso se encarga el GameRunner, que es quien tiene temporizadores.
 */
export function prepareGame(lobby: Lobby, userId: string, randomInt: RandomInt): void {
  requireHost(lobby, userId);

  // Desde FINISHED se puede jugar otra sin volver a crear la sala.
  if (!isLobbyIdle(lobby)) {
    throw new LobbyOperationError('PARTIDA_EN_CURSO', 'La partida ya empezó.');
  }
  if (lobby.players.size < MIN_PLAYERS_TO_START) {
    throw new LobbyOperationError('FALTAN_JUGADORES', 'No hay nadie en la sala.');
  }

  // Los cartones no se repiten ni dentro de un jugador ni entre jugadores de
  // la sala (PLAN.md sección 3).
  const usados = new Set<string>();
  for (const jugador of lobby.players.values()) {
    jugador.cards = generateUniqueCards(lobby.settings.cardsPerPlayer, randomInt, usados);
    for (const carton of jugador.cards) usados.add(cardKey(carton));

    jugador.marks = new Set();
    delete jugador.claimBlockedUntil;
    delete jugador.closeAnnounced;
    delete jugador.winningCardIndex;
  }

  // Cada partida estrena lotera: todas con la misma probabilidad.
  lobby.lotero = pickLotero(randomInt);
  lobby.bag = createBag(randomInt);
  lobby.drawn = [];
  lobby.lineWinnerIds = [];
  lobby.winnerIds = [];
  delete lobby.lineClosesAt;
  delete lobby.fullClosesAt;
  lobby.status = 'COUNTDOWN';
}

/**
 * Saca el siguiente número del bolillero. Devuelve undefined si se acabó.
 * `bag` nunca sale hacia el cliente: sabría qué viene.
 */
export function drawNext(lobby: Lobby): number | undefined {
  const numero = lobby.bag.pop();
  if (numero === undefined) return undefined;

  lobby.drawn.push(numero);

  // Con marcado automático el jugador no tiene que hacer nada.
  if (lobby.settings.autoMark) {
    for (const jugador of lobby.players.values()) {
      if (jugador.cards.some((carton) => carton.some((fila) => fila.includes(numero)))) {
        jugador.marks.add(numero);
      }
    }
  }

  return numero;
}

/** Marca un número en un cartón. Solo vale si ya salió del bolillero. */
export function markNumber(lobby: Lobby, userId: string, cardIndex: number, numero: number): void {
  const jugador = requirePlayerInGame(lobby, userId);
  const carton = jugador.cards[cardIndex];

  if (!carton) throw new LobbyOperationError('CARTON_INVALIDO', 'Ese cartón no es tuyo.');
  if (!lobby.drawn.includes(numero)) {
    throw new LobbyOperationError('NUMERO_NO_CANTADO', 'Ese número todavía no sale.');
  }
  if (!carton.some((fila) => fila.includes(numero))) {
    throw new LobbyOperationError('CARTON_INVALIDO', 'Ese número no está en el cartón.');
  }

  jugador.marks.add(numero);
}

export function unmarkNumber(lobby: Lobby, userId: string, numero: number): void {
  requirePlayerInGame(lobby, userId).marks.delete(numero);
}

export type ClaimOutcome =
  | { kind: 'RECHAZADO'; reason: string; blockedUntil: number }
  | { kind: 'GANA_LINEA'; cierraEn: number; primero: boolean }
  | { kind: 'GANA_LOTA'; cierraEn: number; primero: boolean };

/**
 * Valida una lota contra los números **efectivamente cantados**, no contra lo
 * que el jugador tenga marcado: el cliente no decide nada.
 *
 * Si es válida y es la primera, abre una ventana de empate: quien cante bien
 * dentro de ella con el mismo último número también gana (PLAN.md sección 3).
 */
export function claim(
  lobby: Lobby,
  userId: string,
  tipo: ClaimType,
  cardIndex: number,
  ahora = Date.now(),
): ClaimOutcome {
  const jugador = requirePlayerInGame(lobby, userId);

  if (jugador.claimBlockedUntil !== undefined && jugador.claimBlockedUntil > ahora) {
    throw new LobbyOperationError(
      'CLAIM_BLOQUEADO',
      'Espera unos segundos antes de volver a cantar.',
    );
  }

  const carton = jugador.cards[cardIndex];
  if (!carton) throw new LobbyOperationError('CARTON_INVALIDO', 'Ese cartón no es tuyo.');

  const cantados = new Set(lobby.drawn);

  if (tipo === 'LINE') {
    if (lobby.settings.prizeMode !== 'LINEA_Y_CARTON') {
      return rechazar(jugador, 'En esta sala no se juega por línea.', ahora);
    }
    if (lobby.lineWinnerIds.length > 0 && (lobby.lineClosesAt ?? 0) <= ahora) {
      throw new LobbyOperationError('LINEA_YA_GANADA', 'La línea ya la ganó alguien.');
    }
    if (findCompletedLine(carton, cantados) === null) {
      return rechazar(jugador, 'Ese cartón no tiene ninguna fila completa.', ahora);
    }

    const primero = lobby.lineWinnerIds.length === 0;
    if (primero) lobby.lineClosesAt = ahora + TIE_WINDOW_MS;
    if (!lobby.lineWinnerIds.includes(userId)) lobby.lineWinnerIds.push(userId);
    jugador.winningCardIndex ??= cardIndex;

    return { kind: 'GANA_LINEA', cierraEn: lobby.lineClosesAt!, primero };
  }

  if (!checkFull(carton, cantados)) {
    return rechazar(jugador, 'A ese cartón todavía le faltan números.', ahora);
  }

  const primero = lobby.winnerIds.length === 0;
  if (primero) lobby.fullClosesAt = ahora + TIE_WINDOW_MS;
  if (!lobby.winnerIds.includes(userId)) lobby.winnerIds.push(userId);
  jugador.winningCardIndex = cardIndex;

  return { kind: 'GANA_LOTA', cierraEn: lobby.fullClosesAt!, primero };
}

/** Cantar mal cuesta un bloqueo: si no, se podría pulsar sin parar. */
function rechazar(jugador: LobbyPlayer, motivo: string, ahora: number): ClaimOutcome {
  jugador.claimBlockedUntil = ahora + INVALID_CLAIM_BLOCK_MS;
  return { kind: 'RECHAZADO', reason: motivo, blockedUntil: jugador.claimBlockedUntil };
}

function requirePlayerInGame(lobby: Lobby, userId: string): LobbyPlayer {
  if (lobby.status !== 'PLAYING') {
    throw new LobbyOperationError('PARTIDA_NO_EMPEZADA', 'La partida no está en juego.');
  }
  const jugador = lobby.players.get(userId);
  if (!jugador) throw new LobbyOperationError('NO_ESTAS_EN_SALA', 'No estás en esta sala.');
  return jugador;
}

/** Cuantos numeros le faltan al jugador en su mejor carton. */
export function remainingToWin(lobby: Lobby, jugador: LobbyPlayer): number {
  const cantados = new Set(lobby.drawn);
  let minimo = NUMBERS_PER_CARD;

  for (const carton of jugador.cards) {
    const faltan = cardNumbers(carton).filter((numero) => !cantados.has(numero)).length;
    if (faltan < minimo) minimo = faltan;
  }
  return minimo;
}

/**
 * Avisos que toca mandar a la sala tras cantar un numero: a quien le queden 3,
 * 2 o 1 numeros. Cada jugador genera como mucho un aviso por escalon, y solo
 * si baja respecto al ultimo que se anuncio.
 */
export function closeToWinAnnouncements(lobby: Lobby): PlayerCloseToWin[] {
  const mayorUmbral = Math.max(...CLOSE_TO_WIN_THRESHOLDS);
  const avisos: PlayerCloseToWin[] = [];

  for (const jugador of lobby.players.values()) {
    const faltan = remainingToWin(lobby, jugador);

    // 0 ya es lota: de eso avisa la pantalla de victoria, no este aviso.
    if (faltan < 1 || faltan > mayorUmbral) continue;
    if (jugador.closeAnnounced !== undefined && jugador.closeAnnounced <= faltan) continue;

    jugador.closeAnnounced = faltan;
    avisos.push({ userId: jugador.userId, username: jugador.username, remaining: faltan });
  }

  return avisos;
}

/** Vista de los ganadores para la pantalla de victoria. */
export function toWinnerViews(lobby: Lobby, userIds: readonly string[]): WinnerView[] {
  const vistas: WinnerView[] = [];

  for (const userId of userIds) {
    const jugador = lobby.players.get(userId);
    if (!jugador) continue;

    const indice = jugador.winningCardIndex ?? 0;
    vistas.push({
      userId: jugador.userId,
      username: jugador.username,
      victoryMessage: jugador.victoryMessage,
      equipped: jugador.equipped,
      card: jugador.cards[indice] ?? [],
      // Los premios los rellena settleGame al cerrar la contabilidad.
      coinsWon: 0,
      potWon: 0,
    });
  }

  return vistas;
}
