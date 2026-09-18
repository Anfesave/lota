import { LOBBY_CODE_LENGTH, LOBBY_NAME_MAX_LENGTH, type PublicLobbySummary } from '@lota/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Campo } from '../components/Campo.js';
import { t } from '../i18n/es-CL.js';
import { api, postJson } from '../lib/api.js';
import { mensajeDeError } from './Login.js';

/** Cada cuánto se refresca el listado de salas. Viven en memoria: es barato. */
const REFRESCO_MS = 5_000;

export function Lobby() {
  const [salas, setSalas] = useState<PublicLobbySummary[] | null>(null);
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    try {
      const { lobbies } = await api<{ lobbies: PublicLobbySummary[] }>('/lobbies');
      setSalas(lobbies);
    } catch {
      // Un fallo puntual del sondeo no debe romper la pantalla; se reintenta.
      setSalas((anterior) => anterior ?? []);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const temporizador = setInterval(() => void cargar(), REFRESCO_MS);
    return () => clearInterval(temporizador);
  }, [cargar]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h2 className="text-xl font-bold text-slate-100">{t.lobby.titulo}</h2>

      <section className="flex flex-col gap-3">
        {salas === null ? (
          <p className="text-slate-400">{t.comun.cargando}</p>
        ) : salas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
            <p className="font-semibold text-slate-300">{t.lobby.sinSalas}</p>
            <p className="mt-1 text-sm text-slate-500">{t.lobby.sinSalasDetalle}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {salas.map((sala) => (
              <li key={sala.code}>
                <button
                  type="button"
                  onClick={() => navigate(`/sala/${sala.code}`)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left transition hover:border-lota-oro/50"
                >
                  <span>
                    <span className="block font-semibold text-slate-100">{sala.name}</span>
                    <span className="block text-xs text-slate-500">
                      {t.lobby.anfitrionEs(sala.hostUsername)}
                    </span>
                  </span>
                  <span className="text-sm text-slate-400">
                    {t.lobby.jugadores(sala.players, sala.maxPlayers)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <CrearSala onCreada={(code) => navigate(`/sala/${code}`)} />
        <UnirseConCodigo onUnirse={(code) => navigate(`/sala/${code}`)} />
      </div>
    </main>
  );
}

function CrearSala({ onCreada }: { onCreada: (code: string) => void }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const { code } = await postJson<{ code: string }>('/lobbies', {
        name,
        visibility,
        ...(visibility === 'PRIVATE' ? { password } : {}),
      });
      onCreada(code);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <h3 className="font-bold text-slate-100">{t.lobby.crearSala}</h3>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <Campo
        etiqueta={t.lobby.nombreSala}
        valor={name}
        onChange={setName}
        maxLength={LOBBY_NAME_MAX_LENGTH}
        placeholder={t.lobby.nombreSalaEjemplo}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-200">{t.lobby.visibilidad}</legend>
        {(['PUBLIC', 'PRIVATE'] as const).map((opcion) => (
          <label key={opcion} className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="radio"
              name="visibility"
              value={opcion}
              checked={visibility === opcion}
              onChange={() => setVisibility(opcion)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">
                {opcion === 'PUBLIC' ? t.lobby.publica : t.lobby.privada}
              </span>
              <span className="block text-xs text-slate-500">
                {opcion === 'PUBLIC' ? t.lobby.publicaAyuda : t.lobby.privadaAyuda}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {visibility === 'PRIVATE' ? (
        <Campo
          etiqueta={t.lobby.contrasenaSala}
          tipo="password"
          valor={password}
          onChange={setPassword}
          autoComplete="off"
        />
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {enviando ? t.lobby.creando : t.lobby.crear}
      </button>
    </form>
  );
}

function UnirseConCodigo({ onUnirse }: { onUnirse: (code: string) => void }) {
  const [codigo, setCodigo] = useState('');

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = codigo.trim().toUpperCase();
    if (limpio.length === LOBBY_CODE_LENGTH) onUnirse(limpio);
  }

  return (
    <form
      onSubmit={enviar}
      className="flex h-fit flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <h3 className="font-bold text-slate-100">{t.lobby.unirseConCodigo}</h3>
      <Campo
        etiqueta={t.lobby.codigo}
        valor={codigo}
        onChange={(valor) => setCodigo(valor.toUpperCase())}
        maxLength={LOBBY_CODE_LENGTH}
        placeholder="K7P2QX"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={codigo.trim().length !== LOBBY_CODE_LENGTH}
        className="rounded-lg border border-slate-700 px-4 py-2.5 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
      >
        {t.lobby.unirse}
      </button>
    </form>
  );
}
