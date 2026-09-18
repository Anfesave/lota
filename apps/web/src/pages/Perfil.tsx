import {
  COSMETIC_TYPES,
  MAX_VICTORY_MESSAGE_LENGTH,
  cosmeticBySlug,
  formatPesos,
  updateMeSchema,
  type CurrentUser,
  type GameHistoryEntry,
} from '@lota/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Campo } from '../components/Campo.js';
import { t } from '../i18n/es-CL.js';
import { api, patchJson } from '../lib/api.js';
import { useAuthStore } from '../stores/auth.js';
import { mensajeDeError } from './Login.js';

export function Perfil() {
  const user = useAuthStore((estado) => estado.user);
  const [historial, setHistorial] = useState<GameHistoryEntry[] | null>(null);

  useEffect(() => {
    void api<{ games: GameHistoryEntry[] }>('/me/history')
      .then(({ games }) => setHistorial(games))
      .catch(() => setHistorial([]));
  }, []);

  if (!user) return null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h2 className="text-xl font-bold text-slate-100">{t.perfil.titulo}</h2>

      <MensajeDeVictoria user={user} />
      <Equipados user={user} />
      <Historial partidas={historial} />
    </main>
  );
}

/** Editor del mensaje de victoria. */
function MensajeDeVictoria({ user }: { user: CurrentUser }) {
  const setUser = useAuthStore((estado) => estado.setUser);

  const [mensaje, setMensaje] = useState(user.victoryMessage);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardado(false);

    // Mismo esquema que usa el servidor: el error sale al tiro y no hay dos
    // reglas que puedan divergir.
    const parsed = updateMeSchema.safeParse({ victoryMessage: mensaje });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t.comun.errorGenerico);
      return;
    }

    setEnviando(true);
    try {
      setUser(await patchJson<CurrentUser>('/me', parsed.data));
      setGuardado(true);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  const sinCambios = mensaje.trim() === user.victoryMessage;

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {guardado && sinCambios ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
        >
          {t.perfil.guardado}
        </p>
      ) : null}

      <Campo
        etiqueta={t.perfil.tuMensaje}
        ayuda={t.perfil.tuMensajeAyuda}
        valor={mensaje}
        onChange={(valor) => {
          setMensaje(valor);
          setGuardado(false);
        }}
        maxLength={MAX_VICTORY_MESSAGE_LENGTH}
      />

      <button
        type="submit"
        disabled={enviando || sinCambios}
        className="self-start rounded-lg bg-lota-acento px-4 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {enviando ? t.perfil.guardando : t.perfil.guardar}
      </button>
    </form>
  );
}

function Equipados({ user }: { user: CurrentUser }) {
  const puestos = COSMETIC_TYPES.map((tipo) => ({
    tipo,
    cosmetico: cosmeticBySlug(user.equipped[tipo]),
  })).filter((fila) => fila.cosmetico !== undefined);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-3 font-bold text-slate-100">{t.perfil.equipados}</h3>

      {puestos.length === 0 ? (
        <p className="text-sm text-slate-500">{t.perfil.nadaEquipado}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {puestos.map(({ tipo, cosmetico }) => (
            <li
              key={tipo}
              className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200"
              title={t.tienda.tipos[tipo]}
            >
              {cosmetico!.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Historial({ partidas }: { partidas: GameHistoryEntry[] | null }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-3 font-bold text-slate-100">{t.perfil.historial}</h3>

      {partidas === null ? (
        <p className="text-sm text-slate-500">{t.comun.cargando}</p>
      ) : partidas.length === 0 ? (
        <p className="text-sm text-slate-500">{t.perfil.sinHistorial}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {partidas.map((partida) => (
            <li
              key={partida.gameId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm"
            >
              <span>
                <span
                  className={
                    partida.result === 'NONE' ? 'text-slate-400' : 'font-semibold text-lota-oro'
                  }
                >
                  {t.perfil.resultado[partida.result]}
                </span>
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(partida.playedAt).toLocaleDateString('es-CL')} &middot;{' '}
                  {t.perfil.jugadores(partida.players)}
                </span>
              </span>

              <span className="flex gap-3 text-xs">
                {partida.coinsWon > 0 ? (
                  <span className="text-lota-oro">+{partida.coinsWon}</span>
                ) : null}
                {partida.potWon > 0 ? (
                  <span className="text-emerald-300">{formatPesos(partida.potWon)}</span>
                ) : partida.bet > 0 ? (
                  <span className="text-slate-500">−{formatPesos(partida.bet)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
