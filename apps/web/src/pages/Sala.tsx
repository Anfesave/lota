import {
  BET_STEP,
  CALL_INTERVALS_MS,
  MAX_BET,
  MAX_CARDS_PER_PLAYER,
  MIN_BET,
  MIN_CARDS_PER_PLAYER,
  formatPesos,
  type LobbyPreview,
  type LobbySettings,
  type LobbyStateView,
} from '@lota/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Campo } from '../components/Campo.js';
import { Chat } from '../components/Chat.js';
import { Cuentas } from '../components/juego/Cuentas.js';
import { Partida } from '../components/juego/Partida.js';
import { Victoria } from '../components/juego/Victoria.js';
import { ControlesLocutor, useLocutor } from '../components/juego/Locutor.js';
import { t } from '../i18n/es-CL.js';
import { api, ApiError } from '../lib/api.js';
import { useAuthStore } from '../stores/auth.js';
import { useLobbyStore } from '../stores/lobby.js';

type Fase = 'cargando' | 'pideContrasena' | 'dentro' | 'error';

export function Sala() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((estado) => estado.user);
  const estado = useLobbyStore((s) => s.estado);
  const mensajes = useLobbyStore((s) => s.mensajes);
  const aviso = useLobbyStore((s) => s.aviso);
  const entrar = useLobbyStore((s) => s.entrar);
  const salir = useLobbyStore((s) => s.salir);
  const limpiarAviso = useLobbyStore((s) => s.limpiarAviso);
  const olvidarSala = useLobbyStore((s) => s.olvidarSala);
  const final = useLobbyStore((s) => s.final);
  const cerrarVictoria = useLobbyStore((s) => s.cerrarVictoria);
  const locutor = useLocutor();

  const [fase, setFase] = useState<Fase>('cargando');
  const [error, setError] = useState<string | null>(null);

  // Al entrar: primero averiguamos si la sala pide contraseña, y solo si no
  // la pide entramos directo. Así el link de invitación funciona de una.
  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const preview = await api<LobbyPreview>(`/lobbies/${code}`);
        if (cancelado) return;

        if (preview.requiresPassword) {
          setFase('pideContrasena');
          return;
        }

        const respuesta = await entrar(code);
        if (cancelado) return;

        if (respuesta.ok) setFase('dentro');
        else {
          setError(respuesta.error.message);
          setFase('error');
        }
      } catch (fallo) {
        if (cancelado) return;
        setError(fallo instanceof ApiError ? fallo.message : t.comun.errorGenerico);
        setFase('error');
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [code, entrar]);

  // Expulsión o reinicio del servidor: se vuelve al listado con el motivo.
  useEffect(() => {
    if (!aviso) return;
    const motivo = aviso;
    limpiarAviso();
    navigate('/', { replace: true, state: { aviso: motivo } });
  }, [aviso, limpiarAviso, navigate]);

  async function abandonar() {
    await salir();
    navigate('/', { replace: true });
  }

  if (fase === 'cargando') {
    return (
      <p role="status" className="py-20 text-center text-slate-400">
        {t.sala.entrando}
      </p>
    );
  }

  if (fase === 'error') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
        <p role="alert" className="text-rose-300">
          {error ?? t.sala.salaNoExiste}
        </p>
        <button
          type="button"
          onClick={() => {
            olvidarSala();
            navigate('/', { replace: true });
          }}
          className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800"
        >
          {t.comun.volver}
        </button>
      </main>
    );
  }

  if (fase === 'pideContrasena') {
    return (
      <PedirContrasena
        error={error}
        onEnviar={async (password) => {
          setError(null);
          const respuesta = await entrar(code, password);
          if (respuesta.ok) setFase('dentro');
          else setError(respuesta.error.message);
        }}
      />
    );
  }

  if (!estado || !user) {
    return (
      <p role="status" className="py-20 text-center text-slate-400">
        {t.comun.cargando}
      </p>
    );
  }

  const soyAnfitrion = estado.hostId === user.id;
  const yo = estado.players.find((jugador) => jugador.userId === user.id);
  const enJuego = estado.status === 'COUNTDOWN' || estado.status === 'PLAYING';

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <Encabezado estado={estado} onSalir={() => void abandonar()} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {enJuego ? (
            <Partida
              estado={estado}
              misCosmeticos={user.equipped}
              controlesLocutor={<ControlesLocutor locutor={locutor} />}
              dicho={locutor.dicho}
            />
          ) : (
            <>
              <ListaJugadores estado={estado} soyAnfitrion={soyAnfitrion} miId={user.id} />
              <Cuentas estado={estado} />
              <Configuracion estado={estado} soyAnfitrion={soyAnfitrion} />
            </>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {enJuego ? (
            <>
              <ListaJugadores estado={estado} soyAnfitrion={false} miId={user.id} />
              {/* Durante la partida solo si ya hay algo que contar. */}
              {estado.partidasJugadas > 0 ? <Cuentas estado={estado} /> : null}
            </>
          ) : (
            <Acciones estado={estado} soyAnfitrion={soyAnfitrion} listo={yo?.ready ?? false} />
          )}
          <Chat mensajes={mensajes} onEnviar={useLobbyStore.getState().enviarChat} />
        </div>
      </div>

      {final ? (
        <Victoria
          final={final}
          estado={estado}
          miId={user.id}
          onVolver={cerrarVictoria}
          onSalir={() => {
            cerrarVictoria();
            void abandonar();
          }}
        />
      ) : null}
    </main>
  );
}

function PedirContrasena({
  error,
  onEnviar,
}: {
  error: string | null;
  onEnviar: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await onEnviar(password);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col justify-center gap-5 px-4 py-16">
      <header className="text-center">
        <h2 className="text-xl font-bold text-slate-100">{t.sala.pideContrasena}</h2>
        <p className="mt-1 text-sm text-slate-400">{t.sala.pideContrasenaAyuda}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo
          etiqueta={t.lobby.contrasenaSala}
          tipo="password"
          valor={password}
          onChange={setPassword}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {t.sala.entrar}
        </button>
      </form>
    </main>
  );
}

function Encabezado({ estado, onSalir }: { estado: LobbyStateView; onSalir: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/sala/${estado.code}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_000);
    } catch {
      // Sin permiso de portapapeles el usuario siempre puede copiar el código.
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-100">{estado.name}</h2>
        <p className="font-mono text-sm tracking-widest text-lota-oro">{estado.code}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copiar()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
        >
          {copiado ? t.sala.linkCopiado : t.sala.copiarLink}
        </button>
        <button
          type="button"
          onClick={onSalir}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
        >
          {t.sala.salir}
        </button>
      </div>
    </header>
  );
}

function ListaJugadores({
  estado,
  soyAnfitrion,
  miId,
}: {
  estado: LobbyStateView;
  soyAnfitrion: boolean;
  miId: string;
}) {
  const expulsar = useLobbyStore((s) => s.expulsar);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-3 font-bold text-slate-100">
        {t.sala.jugadoresTitulo}{' '}
        <span className="text-sm font-normal text-slate-500">
          {t.lobby.jugadores(estado.players.length, estado.maxPlayers)}
        </span>
      </h3>

      <ul className="flex flex-col gap-2">
        {estado.players.map((jugador) => (
          <li
            key={jugador.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-100">{jugador.username}</span>
              {jugador.isHost ? <Etiqueta tono="oro">{t.sala.anfitrion}</Etiqueta> : null}
              {estado.settings.apuestas && jugador.bet > 0 ? (
                <Etiqueta tono="oro">{t.sala.apuestaDe(formatPesos(jugador.bet))}</Etiqueta>
              ) : null}
              {!jugador.connected ? (
                <Etiqueta tono="gris">{t.sala.desconectado}</Etiqueta>
              ) : jugador.ready ? (
                <Etiqueta tono="verde">{t.sala.listo}</Etiqueta>
              ) : (
                <Etiqueta tono="gris">{t.sala.noListo}</Etiqueta>
              )}
            </span>

            {soyAnfitrion && jugador.userId !== miId ? (
              <button
                type="button"
                onClick={() => void expulsar(jugador.userId)}
                className="text-xs text-rose-300 hover:underline"
              >
                {t.sala.expulsar}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Etiqueta({ tono, children }: { tono: 'oro' | 'verde' | 'gris'; children: string }) {
  const clases = {
    oro: 'bg-lota-oro/15 text-lota-oro',
    verde: 'bg-emerald-500/15 text-emerald-300',
    gris: 'bg-slate-600/25 text-slate-400',
  } as const;

  return <span className={`rounded-full px-2 py-0.5 text-xs ${clases[tono]}`}>{children}</span>;
}

function Configuracion({
  estado,
  soyAnfitrion,
}: {
  estado: LobbyStateView;
  soyAnfitrion: boolean;
}) {
  const cambiarConfig = useLobbyStore((s) => s.cambiarConfig);
  const { settings } = estado;

  // Solo se puede tocar en WAITING, y solo el anfitrión (el servidor lo exige
  // igual; aquí es para no ofrecer algo que va a fallar).
  const editable = soyAnfitrion && estado.status === 'WAITING';

  function cambiar(cambios: Partial<LobbySettings>) {
    void cambiarConfig(cambios);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div>
        <h3 className="font-bold text-slate-100">{t.sala.configuracion}</h3>
        {!editable ? <p className="text-xs text-slate-500">{t.sala.soloAnfitrion}</p> : null}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-200">{t.sala.cartonesPorJugador}</span>
        <select
          value={settings.cardsPerPlayer}
          disabled={!editable}
          onChange={(evento) =>
            cambiar({
              cardsPerPlayer: Number(evento.target.value) as LobbySettings['cardsPerPlayer'],
            })
          }
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-60"
        >
          {Array.from(
            { length: MAX_CARDS_PER_PLAYER - MIN_CARDS_PER_PLAYER + 1 },
            (_, i) => i + MIN_CARDS_PER_PLAYER,
          ).map((cuantos) => (
            <option key={cuantos} value={cuantos}>
              {cuantos}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-200">{t.sala.velocidad}</span>
        <select
          value={settings.callIntervalMs}
          disabled={!editable}
          onChange={(evento) =>
            cambiar({
              callIntervalMs: Number(evento.target.value) as LobbySettings['callIntervalMs'],
            })
          }
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-60"
        >
          {CALL_INTERVALS_MS.map((intervalo) => (
            <option key={intervalo} value={intervalo}>
              {t.sala.velocidades[intervalo]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-200">{t.sala.modoPremio}</span>
        <select
          value={settings.prizeMode}
          disabled={!editable}
          onChange={(evento) =>
            cambiar({ prizeMode: evento.target.value as LobbySettings['prizeMode'] })
          }
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-60"
        >
          <option value="LINEA_Y_CARTON">{t.sala.modos.LINEA_Y_CARTON}</option>
          <option value="CARTON_LLENO">{t.sala.modos.CARTON_LLENO}</option>
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.autoMark}
          disabled={!editable}
          onChange={(evento) => cambiar({ autoMark: evento.target.checked })}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-slate-200">{t.sala.autoMarcado}</span>
          <span className="block text-xs text-slate-500">{t.sala.autoMarcadoAyuda}</span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.dichos}
          disabled={!editable}
          onChange={(evento) => cambiar({ dichos: evento.target.checked })}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-slate-200">{t.sala.dichos}</span>
          <span className="block text-xs text-slate-500">{t.sala.dichosAyuda}</span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.apuestas}
          disabled={!editable}
          onChange={(evento) => cambiar({ apuestas: evento.target.checked })}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-slate-200">{t.sala.apuestas}</span>
          <span className="block text-xs text-slate-500">{t.sala.apuestasAyuda}</span>
          <span className="block text-xs text-slate-600">{t.sala.apuestasRegistro}</span>
        </span>
      </label>
    </section>
  );
}

function Acciones({
  estado,
  soyAnfitrion,
  listo,
}: {
  estado: LobbyStateView;
  soyAnfitrion: boolean;
  listo: boolean;
}) {
  const marcarListo = useLobbyStore((s) => s.marcarListo);
  const empezar = useLobbyStore((s) => s.empezar);
  const [error, setError] = useState<string | null>(null);

  async function comenzar() {
    setError(null);
    const respuesta = await empezar();
    if (!respuesta.ok) setError(respuesta.error.message);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void marcarListo(!listo)}
        className={
          listo
            ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 font-bold text-emerald-200'
            : 'rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110'
        }
      >
        {listo ? t.sala.marcarNoListo : t.sala.marcarListo}
      </button>

      {estado.settings.apuestas ? <PanelApuesta estado={estado} /> : null}

      {soyAnfitrion ? (
        <button
          type="button"
          onClick={() => void comenzar()}
          className="rounded-lg bg-lota-oro px-4 py-2.5 font-black text-slate-900 transition hover:brightness-110"
        >
          {t.sala.comenzar}
        </button>
      ) : null}

      <PlazasLibres estado={estado} />
    </section>
  );
}

/**
 * Apuesta propia y pozo de la sala. Los montos van de $500 en $500; la app
 * solo lleva la cuenta, no mueve dinero (ver economy.ts).
 */
function PanelApuesta({ estado }: { estado: LobbyStateView }) {
  const apostar = useLobbyStore((s) => s.apostar);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(nuevo: number) {
    setError(null);
    const monto = Math.min(MAX_BET, Math.max(MIN_BET, nuevo));
    const respuesta = await apostar(monto);
    if (!respuesta.ok) setError(respuesta.error.message);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-lota-oro/25 bg-lota-oro/5 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{t.sala.tuApuesta}</p>

      {error ? (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void cambiar(estado.yourBet - BET_STEP)}
          disabled={estado.yourBet <= MIN_BET}
          aria-label={t.sala.bajarApuesta}
          className="size-8 rounded-lg border border-slate-700 font-bold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
        >
          −
        </button>

        <output className="flex-1 text-center text-lg font-black tabular-nums text-lota-oro">
          {formatPesos(estado.yourBet)}
        </output>

        <button
          type="button"
          onClick={() => void cambiar(estado.yourBet + BET_STEP)}
          disabled={estado.yourBet >= MAX_BET}
          aria-label={t.sala.subirApuesta}
          className="size-8 rounded-lg border border-slate-700 font-bold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
        >
          +
        </button>
      </div>

      {estado.yourBet > 0 ? (
        <button
          type="button"
          onClick={() => void cambiar(0)}
          className="text-xs text-slate-500 hover:underline"
        >
          {t.sala.quitarApuesta}
        </button>
      ) : null}

      <p className="border-t border-slate-800 pt-2 text-sm text-slate-300">
        {t.sala.pozoTotal}:{' '}
        <span className="font-bold text-lota-oro">{formatPesos(estado.pot)}</span>
      </p>
    </div>
  );
}

function PlazasLibres({ estado }: { estado: LobbyStateView }) {
  return (
    <p className="text-center text-xs text-slate-500">
      {t.lobby.jugadores(estado.players.length, estado.maxPlayers)}
    </p>
  );
}
