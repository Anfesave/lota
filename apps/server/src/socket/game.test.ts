import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  INVALID_CLAIM_BLOCK_MS,
  LOTERO_IDS,
  LOTERO_POR_DEFECTO,
  MAX_NUMBER,
  NUMBERS_PER_CARD,
  cardNumbers,
  type ClaimRejected,
  type GameFinished,
  type LobbyStateView,
  type NumberCalled,
  type PlayerCloseToWin,
  type WinnerView,
} from '@lota/shared';
import { closeToWinAnnouncements, drawNext } from '../game/engine.js';
import { crearAyudantes } from '../test/socketHelpers.js';
import type { Lobby } from '../lobby/types.js';

const ayudantes = crearAyudantes();

beforeAll(async () => {
  await ayudantes.iniciar();
});

afterAll(async () => {
  await ayudantes.cerrar();
});

afterEach(async () => {
  await ayudantes.limpiar();
});

function sala(code: string): Lobby {
  const lobby = ayudantes.app.lobbies.getByCode(code);
  if (!lobby) throw new Error(`no existe la sala ${code}`);
  return lobby;
}

/**
 * Congela el locutor y deja cantados exactamente los números que se pidan.
 * Así los tests de canto no dependen del azar del bolillero.
 */
function cantarExactamente(code: string, numeros: readonly number[]): void {
  const lobby = sala(code);
  ayudantes.app.games.stop(lobby.id);
  lobby.drawn = [...numeros];
}

/**
 * Canta el siguiente numero sin esperar al reloj del locutor, y dispara los
 * avisos de "le faltan pocos" igual que haria el runner.
 */
function forzarCanto(code: string): void {
  const lobby = sala(code);
  drawNext(lobby);
  for (const aviso of closeToWinAnnouncements(lobby)) {
    ayudantes.app.io.to(`lobby:${lobby.id}`).emit('game:playerClose', aviso);
  }
}

describe('empezar la partida', () => {
  it('solo el anfitrión puede empezar', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code } = await ayudantes.crearSala(anfitrion);
    const invitado = await ayudantes.entrarEnSala(code);

    const res = await ayudantes.emitir(invitado.socket, 'game:start');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_ERES_ANFITRION');
  });

  it('reparte cartones, cuenta atrás y empieza a cantar', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { socket } = await ayudantes.crearSala(anfitrion);

    const cuentas = ayudantes.recolectar<{ seconds: number }>(socket, 'game:countdown');
    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    const cantos = ayudantes.recolectar<NumberCalled>(socket, 'game:numberCalled');

    expect((await ayudantes.emitir(socket, 'game:start')).ok).toBe(true);

    await cuentas.esperarQue(() => true);

    const comienzo = await comienzos.esperarQue(() => true);
    expect(comienzo.yourCards).toHaveLength(1);
    expect(cardNumbers(comienzo.yourCards[0]!)).toHaveLength(NUMBERS_PER_CARD);

    const tercero = await cantos.esperarQue((canto) => canto.index === 3);
    expect(tercero.number).toBeGreaterThanOrEqual(1);
    expect(tercero.number).toBeLessThanOrEqual(MAX_NUMBER);
    // Los números salen en orden y sin repetirse.
    const salidos = cantos.recibidos.map((c) => c.number);
    expect(new Set(salidos).size).toBe(salidos.length);
  });

  it('cada jugador recibe cartones distintos', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion, {
      settings: { cardsPerPlayer: 2 },
    });
    const invitado = await ayudantes.entrarEnSala(code);

    const mios = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    const suyos = ayudantes.recolectar<{ yourCards: number[][][] }>(
      invitado.socket,
      'game:started',
    );

    await ayudantes.emitir(socket, 'game:start');

    const a = await mios.esperarQue(() => true);
    const b = await suyos.esperarQue(() => true);

    expect(a.yourCards).toHaveLength(2);
    expect(b.yourCards).toHaveLength(2);

    const claves = [...a.yourCards, ...b.yourCards].map((carton) => cardNumbers(carton).join(','));
    expect(new Set(claves).size).toBe(4);
  });

  it('el estado no filtra la bolsa ni los cartones ajenos', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);
    const invitado = await ayudantes.entrarEnSala(code);

    const estados = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');
    await ayudantes.emitir(socket, 'game:start');
    const estado = await estados.esperarQue((e) => e.status === 'PLAYING');

    expect(estado.yourCards).toHaveLength(1);
    expect(JSON.stringify(estado)).not.toContain('"bag"');

    // Los cartones del invitado no aparecen por ningún lado del estado.
    const lobby = sala(code);
    const ajenos = lobby.players.get(invitado.sesion.userId)!.cards;
    expect(JSON.stringify(estado)).not.toContain(JSON.stringify(ajenos[0]));
  });
});

describe('marcar números', () => {
  it('acepta un número cantado del propio cartón y lo devuelve en el estado', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    const numero = cardNumbers(yourCards[0]!)[0]!;
    cantarExactamente(code, [numero]);

    const estados = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');
    expect((await ayudantes.emitir(socket, 'game:mark', { cardIndex: 0, number: numero })).ok).toBe(
      true,
    );

    const estado = await estados.esperarQue((e) => e.yourMarks.includes(numero));
    expect(estado.yourMarks).toEqual([numero]);
  });

  it('rechaza un número que todavía no sale', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    cantarExactamente(code, []);
    const numero = cardNumbers(yourCards[0]!)[0]!;

    const res = await ayudantes.emitir(socket, 'game:mark', { cardIndex: 0, number: numero });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NUMERO_NO_CANTADO');
  });

  it('rechaza un número que no está en el cartón', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    const mios = new Set(cardNumbers(yourCards[0]!));
    const ajeno = [...Array(MAX_NUMBER).keys()].map((i) => i + 1).find((n) => !mios.has(n))!;
    cantarExactamente(code, [ajeno]);

    const res = await ayudantes.emitir(socket, 'game:mark', { cardIndex: 0, number: ajeno });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CARTON_INVALIDO');
  });
});

describe('cantar lota', () => {
  /** Empieza una partida y devuelve los números del cartón del anfitrión. */
  async function partidaLista(opciones: { settings?: Record<string, unknown> } = {}) {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion, opciones);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    return { anfitrion, code, socket, carton: yourCards[0]!, numeros: cardNumbers(yourCards[0]!) };
  }

  it('rechaza una lota falsa y bloquea 10 segundos', async () => {
    const { code, socket, numeros } = await partidaLista();
    // Le falta uno para el cartón lleno.
    cantarExactamente(code, numeros.slice(0, -1));

    const rechazos = ayudantes.recolectar<ClaimRejected>(socket, 'game:claimRejected');
    expect((await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 })).ok).toBe(
      true,
    );

    const rechazo = await rechazos.esperarQue(() => true);
    expect(rechazo.type).toBe('FULL');
    expect(rechazo.blockedUntil).toBeGreaterThan(Date.now());
    expect(rechazo.blockedUntil).toBeLessThanOrEqual(Date.now() + INVALID_CLAIM_BLOCK_MS + 500);

    // Y mientras dura el bloqueo no puede volver a cantar, ni bien.
    cantarExactamente(code, numeros);
    const segundo = await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 });
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error.code).toBe('CLAIM_BLOQUEADO');
  });

  it('una lota válida termina la partida y anuncia al ganador', async () => {
    const { anfitrion, code, socket, numeros } = await partidaLista();
    cantarExactamente(code, numeros);

    const finales = ayudantes.recolectar<GameFinished>(socket, 'game:finished');
    await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 });

    const final = await finales.esperarQue(() => true);
    expect(final.reason).toBe('LOTA');
    expect(final.winners).toHaveLength(1);
    expect(final.winners[0]).toMatchObject({
      userId: anfitrion.userId,
      username: anfitrion.username,
      victoryMessage: `Gané yo, ${anfitrion.username}`,
      coinsWon: 0,
    });
    // La pantalla de victoria muestra el cartón ganador.
    expect(cardNumbers(final.winners[0]!.card)).toEqual(numeros);
    expect(sala(code).status).toBe('FINISHED');
  });

  it('si dos cantan con el mismo número, ganan los dos', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);
    const invitado = await ayudantes.entrarEnSala(code);

    const mios = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    const suyos = ayudantes.recolectar<{ yourCards: number[][][] }>(
      invitado.socket,
      'game:started',
    );
    await ayudantes.emitir(socket, 'game:start');

    const a = await mios.esperarQue(() => true);
    const b = await suyos.esperarQue(() => true);

    // Se cantan los números de ambos cartones: los dos tienen lota.
    const todos = [...new Set([...cardNumbers(a.yourCards[0]!), ...cardNumbers(b.yourCards[0]!)])];
    cantarExactamente(code, todos);

    const finales = ayudantes.recolectar<GameFinished>(socket, 'game:finished');
    await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 });
    await ayudantes.emitir(invitado.socket, 'game:claim', { type: 'FULL', cardIndex: 0 });

    const final = await finales.esperarQue(() => true);
    expect(final.winners).toHaveLength(2);
    expect(final.winners.map((g) => g.userId).sort()).toEqual(
      [anfitrion.userId, invitado.sesion.userId].sort(),
    );
  });

  it('la línea se gana sin terminar la partida', async () => {
    const { code, socket, carton, numeros } = await partidaLista();
    const primeraFila = carton[0]!.filter((casilla): casilla is number => casilla !== null);

    cantarExactamente(code, primeraFila);

    const lineas = ayudantes.recolectar<{ winners: WinnerView[] }>(socket, 'game:lineWon');
    const finales = ayudantes.recolectar<GameFinished>(socket, 'game:finished');

    expect((await ayudantes.emitir(socket, 'game:claim', { type: 'LINE', cardIndex: 0 })).ok).toBe(
      true,
    );

    const linea = await lineas.esperarQue(() => true);
    expect(linea.winners).toHaveLength(1);
    expect(finales.recibidos).toHaveLength(0);
    expect(sala(code).status).toBe('PLAYING');
    expect(numeros.length).toBeGreaterThan(primeraFila.length);
  });

  it('no se puede cantar línea en una sala de solo cartón lleno', async () => {
    const { code, socket, carton } = await partidaLista({
      settings: { prizeMode: 'CARTON_LLENO' },
    });
    const primeraFila = carton[0]!.filter((casilla): casilla is number => casilla !== null);
    cantarExactamente(code, primeraFila);

    const rechazos = ayudantes.recolectar<ClaimRejected>(socket, 'game:claimRejected');
    await ayudantes.emitir(socket, 'game:claim', { type: 'LINE', cardIndex: 0 });

    const rechazo = await rechazos.esperarQue(() => true);
    expect(rechazo.reason).toContain('línea');
  });

  it('no se puede cantar antes de que empiece la partida', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { socket } = await ayudantes.crearSala(anfitrion);

    const res = await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('PARTIDA_NO_EMPEZADA');
  });
});

describe('fin del bolillero', () => {
  it('si se acaban los 90 números la partida termina sin ganador', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const finales = ayudantes.recolectar<GameFinished>(socket, 'game:finished');
    await ayudantes.emitir(socket, 'game:start');

    // Con el intervalo acelerado de los tests, los 90 salen enseguida.
    const final = await finales.esperarQue(() => true, 15_000);

    expect(final.reason).toBe('BOLSA_VACIA');
    expect(final.winners).toHaveLength(0);
    expect(final.drawn).toHaveLength(MAX_NUMBER);
    expect(sala(code).status).toBe('FINISHED');
  });
});

describe('reconexión durante la partida', () => {
  it('recupera cartones, marcas y números cantados', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    const numero = cardNumbers(yourCards[0]!)[0]!;
    cantarExactamente(code, [numero]);
    await ayudantes.emitir(socket, 'game:mark', { cardIndex: 0, number: numero });

    // Se cae y vuelve: conserva su sitio y su cartón.
    socket.disconnect();
    const otro = await ayudantes.conectar(anfitrion.cookie);
    const vuelta = await ayudantes.emitir<LobbyStateView>(otro, 'lobby:join', { code });

    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;

    expect(vuelta.data.status).toBe('PLAYING');
    expect(cardNumbers(vuelta.data.yourCards[0]!)).toEqual(cardNumbers(yourCards[0]!));
    expect(vuelta.data.yourMarks).toEqual([numero]);
    expect(vuelta.data.drawn).toEqual([numero]);
  });

  it('con la partida en curso no entra gente nueva', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const estados = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');
    await ayudantes.emitir(socket, 'game:start');
    await estados.esperarQue((e) => e.status === 'PLAYING');
    ayudantes.app.games.stop(sala(code).id);

    const tarde = await ayudantes.crearUsuario();
    const socketTarde = await ayudantes.conectar(tarde.cookie);
    const res = await ayudantes.emitir(socketTarde, 'lobby:join', { code });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('PARTIDA_EN_CURSO');
  });
});

describe('apuestas de la sala', () => {
  it('no se puede apostar si la sala no tiene apuestas', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { socket } = await ayudantes.crearSala(anfitrion);

    const res = await ayudantes.emitir(socket, 'lobby:setBet', { amount: 500 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('APUESTAS_DESACTIVADAS');
  });

  it('suma el pozo con lo que anota cada uno', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion, {
      settings: { apuestas: true },
    });
    const invitado = await ayudantes.entrarEnSala(code);

    const estados = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');

    expect((await ayudantes.emitir(socket, 'lobby:setBet', { amount: 1500 })).ok).toBe(true);
    expect((await ayudantes.emitir(invitado.socket, 'lobby:setBet', { amount: 500 })).ok).toBe(
      true,
    );

    const estado = await estados.esperarQue((e) => e.pot === 2000);
    expect(estado.yourBet).toBe(1500);
    expect(estado.players.find((p) => p.userId === invitado.sesion.userId)?.bet).toBe(500);
  });

  it('rechaza montos que no son múltiplo de 500', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { socket } = await ayudantes.crearSala(anfitrion, { settings: { apuestas: true } });

    const res = await ayudantes.emitir(socket, 'lobby:setBet', { amount: 750 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('DATOS_INVALIDOS');
  });

  it('apagar las apuestas borra lo anotado', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion, {
      settings: { apuestas: true },
    });
    await ayudantes.emitir(socket, 'lobby:setBet', { amount: 1000 });

    const estados = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');
    await ayudantes.emitir(socket, 'lobby:updateSettings', { apuestas: false });

    const estado = await estados.esperarQue((e) => !e.settings.apuestas);
    expect(estado.pot).toBe(0);
    expect(estado.yourBet).toBe(0);
    expect(sala(code).players.get(anfitrion.userId)?.bet).toBe(0);
  });

  it('el ganador se lleva el pozo', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion, {
      settings: { apuestas: true },
    });
    const invitado = await ayudantes.entrarEnSala(code);

    await ayudantes.emitir(socket, 'lobby:setBet', { amount: 2000 });
    await ayudantes.emitir(invitado.socket, 'lobby:setBet', { amount: 500 });

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    cantarExactamente(code, cardNumbers(yourCards[0]!));

    const finales = ayudantes.recolectar<GameFinished>(socket, 'game:finished');
    await ayudantes.emitir(socket, 'game:claim', { type: 'FULL', cardIndex: 0 });

    const final = await finales.esperarQue(() => true);
    expect(final.winners).toHaveLength(1);
    expect(final.winners[0]!.potWon).toBe(2500);
  });
});

describe('la lotera que canta', () => {
  it('cada partida sortea una y todos ven la misma', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);
    const invitado = await ayudantes.entrarEnSala(code);

    const mios = ayudantes.recolectar<LobbyStateView>(socket, 'lobby:state');
    const suyos = ayudantes.recolectar<LobbyStateView>(invitado.socket, 'lobby:state');

    await ayudantes.emitir(socket, 'game:start');

    const a = await mios.esperarQue((e) => e.status === 'PLAYING');
    const b = await suyos.esperarQue((e) => e.status === 'PLAYING');

    expect(LOTERO_IDS).toContain(a.lotero);
    // El sorteo es del servidor: los dos ven exactamente la misma.
    expect(a.lotero).toBe(b.lotero);
  });

  it('fuera de la partida representa la Negra', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { estado } = await ayudantes.crearSala(anfitrion);

    expect(estado.lotero).toBe(LOTERO_POR_DEFECTO);
  });

  it('a lo largo de varias partidas salen las tres', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);
    const vistas = new Set<string>();

    // Se juegan partidas cortas hasta ver a las tres, con tope por si acaso.
    for (let intento = 0; intento < 60 && vistas.size < LOTERO_IDS.length; intento++) {
      const lobby = sala(code);
      lobby.status = 'WAITING';
      await ayudantes.emitir(socket, 'game:start');
      ayudantes.app.games.stop(lobby.id);
      vistas.add(lobby.lotero);
    }

    expect([...vistas].sort()).toEqual([...LOTERO_IDS].sort());
  });
});

describe('aviso de que alguien está por ganar', () => {
  it('avisa a la sala en 3, 2 y 1, una vez por escalón', async () => {
    const anfitrion = await ayudantes.crearUsuario();
    const { code, socket } = await ayudantes.crearSala(anfitrion);

    const comienzos = ayudantes.recolectar<{ yourCards: number[][][] }>(socket, 'game:started');
    await ayudantes.emitir(socket, 'game:start');
    const { yourCards } = await comienzos.esperarQue(() => true);

    const numeros = cardNumbers(yourCards[0]!);
    const avisos = ayudantes.recolectar<PlayerCloseToWin>(socket, 'game:playerClose');

    const lobby = sala(code);
    ayudantes.app.games.stop(lobby.id);

    // Se van cantando los números del cartón de uno en uno, con la bolsa
    // arreglada para que el siguiente sea siempre el que toca.
    for (let cuantos = 1; cuantos <= numeros.length - 1; cuantos++) {
      lobby.drawn = numeros.slice(0, cuantos - 1);
      lobby.bag = [numeros[cuantos - 1]!];
      forzarCanto(code);
    }

    // Hay que esperar a que llegue el ultimo: leer la lista al tiro es una
    // carrera perdida contra la red.
    await avisos.esperarQue((aviso) => aviso.remaining === 1);

    const recibidos = avisos.recibidos.map((a) => a.remaining);
    expect(recibidos).toEqual([3, 2, 1]);
    expect(avisos.recibidos[0]!.username).toBe(anfitrion.username);
  });
});
