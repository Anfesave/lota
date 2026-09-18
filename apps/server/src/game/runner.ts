import {
  COUNTDOWN_SECONDS,
  type GameFinished,
  type NumberCalled,
  type WinnerView,
} from '@lota/shared';
import type { LobbyStore } from '../lobby/store.js';
import type { Lobby } from '../lobby/types.js';
import { drawNext, toWinnerViews, type ClaimOutcome } from './engine.js';

/** Lo que el runner necesita poder avisar; lo implementa la capa de sockets. */
export interface GameEvents {
  countdown(lobbyId: string, seconds: number): void;
  started(lobbyId: string): Promise<void>;
  numberCalled(lobbyId: string, payload: NumberCalled): void;
  lineWon(lobbyId: string, winners: WinnerView[]): void;
  finished(lobbyId: string, payload: GameFinished): void;
  state(lobbyId: string): Promise<void>;
  error(mensaje: string, error: unknown): void;
}

export interface GameRunnerOptions {
  /** Permite acelerar la cuenta regresiva en tests. */
  countdownSeconds?: number;
  /** Sustituye al `callIntervalMs` de la sala; solo para tests. */
  callIntervalMsOverride?: number | undefined;
}

/**
 * Lleva el reloj de las partidas: cuenta regresiva, locutor y cierre de las
 * ventanas de empate.
 *
 * El locutor encadena `setTimeout` en vez de usar `setInterval` (PLAN.md 7):
 * así un canto lento nunca se solapa con el siguiente y parar es inmediato.
 */
export class GameRunner {
  readonly #store: LobbyStore;
  readonly #events: GameEvents;
  readonly #countdownSeconds: number;
  readonly #callIntervalMsOverride: number | undefined;

  /** Temporizador del locutor, uno por sala. */
  readonly #locutor = new Map<string, NodeJS.Timeout>();
  /** Temporizadores de cuenta regresiva y ventanas de empate. */
  readonly #otros = new Map<string, Set<NodeJS.Timeout>>();

  constructor(store: LobbyStore, events: GameEvents, opciones: GameRunnerOptions = {}) {
    this.#store = store;
    this.#events = events;
    this.#countdownSeconds = opciones.countdownSeconds ?? COUNTDOWN_SECONDS;
    this.#callIntervalMsOverride = opciones.callIntervalMsOverride;
  }

  /** Arranca la cuenta regresiva de una sala ya preparada. */
  start(lobby: Lobby): void {
    this.#events.countdown(lobby.id, this.#countdownSeconds);
    this.#otro(lobby.id, this.#countdownSeconds * 1000, () => void this.#comenzar(lobby.id));
  }

  /** Corta todo lo que tenga pendiente esta sala. */
  stop(lobbyId: string): void {
    const locutor = this.#locutor.get(lobbyId);
    if (locutor) clearTimeout(locutor);
    this.#locutor.delete(lobbyId);

    for (const temporizador of this.#otros.get(lobbyId) ?? []) clearTimeout(temporizador);
    this.#otros.delete(lobbyId);
  }

  stopAll(): void {
    for (const lobbyId of [...this.#locutor.keys(), ...this.#otros.keys()]) this.stop(lobbyId);
  }

  /**
   * Reacciona a una lota válida. Al primero que canta se le abre una ventana
   * de empate; el resultado se anuncia cuando esa ventana cierra.
   */
  onClaim(lobby: Lobby, resultado: ClaimOutcome): void {
    if (resultado.kind === 'RECHAZADO' || !resultado.primero) return;

    const espera = Math.max(0, resultado.cierraEn - Date.now());

    if (resultado.kind === 'GANA_LINEA') {
      this.#otro(lobby.id, espera, () => {
        const actual = this.#store.getById(lobby.id);
        if (!actual) return;
        this.#events.lineWon(lobby.id, toWinnerViews(actual, actual.lineWinnerIds));
        void this.#events.state(lobby.id).catch((e) => this.#events.error('estado tras línea', e));
      });
      return;
    }

    // Una lota válida detiene el sorteo al instante: nadie más recibe números.
    const locutor = this.#locutor.get(lobby.id);
    if (locutor) clearTimeout(locutor);
    this.#locutor.delete(lobby.id);

    this.#otro(lobby.id, espera, () => void this.#terminar(lobby.id, 'LOTA'));
  }

  async #comenzar(lobbyId: string): Promise<void> {
    const lobby = this.#store.getById(lobbyId);
    if (!lobby || lobby.status !== 'COUNTDOWN') return;

    lobby.status = 'PLAYING';
    try {
      await this.#events.started(lobbyId);
      await this.#events.state(lobbyId);
    } catch (error) {
      this.#events.error('no se pudo anunciar el comienzo', error);
    }
    this.#programarSiguiente(lobbyId);
  }

  #programarSiguiente(lobbyId: string): void {
    const lobby = this.#store.getById(lobbyId);
    if (!lobby || lobby.status !== 'PLAYING') return;

    const intervalo = this.#callIntervalMsOverride ?? lobby.settings.callIntervalMs;
    const temporizador = setTimeout(() => void this.#cantar(lobbyId), intervalo);
    temporizador.unref();
    this.#locutor.set(lobbyId, temporizador);
  }

  async #cantar(lobbyId: string): Promise<void> {
    const lobby = this.#store.getById(lobbyId);
    if (!lobby || lobby.status !== 'PLAYING') return;

    const numero = drawNext(lobby);
    if (numero === undefined) {
      await this.#terminar(lobbyId, 'BOLSA_VACIA');
      return;
    }

    this.#events.numberCalled(lobbyId, {
      number: numero,
      index: lobby.drawn.length,
      calledAt: new Date().toISOString(),
    });

    this.#programarSiguiente(lobbyId);
  }

  async #terminar(lobbyId: string, reason: GameFinished['reason']): Promise<void> {
    const lobby = this.#store.getById(lobbyId);
    if (!lobby) return;

    this.stop(lobbyId);
    lobby.status = 'FINISHED';

    try {
      this.#events.finished(lobbyId, {
        winners: toWinnerViews(lobby, lobby.winnerIds),
        drawn: [...lobby.drawn],
        reason,
      });
      await this.#events.state(lobbyId);
    } catch (error) {
      this.#events.error('no se pudo anunciar el final', error);
    }
  }

  #otro(lobbyId: string, ms: number, accion: () => void): void {
    const temporizador = setTimeout(() => {
      this.#otros.get(lobbyId)?.delete(temporizador);
      accion();
    }, ms);
    temporizador.unref();

    const conjunto = this.#otros.get(lobbyId) ?? new Set<NodeJS.Timeout>();
    conjunto.add(temporizador);
    this.#otros.set(lobbyId, conjunto);
  }
}
