import { useEffect, useState } from 'react';
import { MAX_NUMBER, MAX_PLAYERS, MIN_NUMBER } from '@lota/shared';
import { t } from './i18n/es-CL.js';

type EstadoServidor = 'comprobando' | 'ok' | 'caido';

/** Pantalla provisional de la Fase 0: confirma que web, shared y servidor se hablan. */
export function App() {
  const [servidor, setServidor] = useState<EstadoServidor>('comprobando');

  useEffect(() => {
    const controlador = new AbortController();
    fetch('/health', { signal: controlador.signal })
      .then((res) => (res.ok ? setServidor('ok') : setServidor('caido')))
      .catch(() => {
        if (!controlador.signal.aborted) setServidor('caido');
      });
    return () => controlador.abort();
  }, []);

  const etiquetaServidor =
    servidor === 'ok'
      ? t.estado.servidorOk
      : servidor === 'caido'
        ? t.estado.servidorCaido
        : t.estado.comprobando;

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <h1 className="text-4xl font-black tracking-tight text-lota-oro sm:text-6xl">
        {t.app.nombre}
      </h1>
      <p className="max-w-md text-balance text-lg text-slate-300">{t.app.lema}</p>

      <p className="text-sm text-slate-400">
        Bolillero de {MIN_NUMBER} a {MAX_NUMBER} &middot; hasta {MAX_PLAYERS} jugadores por sala
      </p>

      <p
        data-testid="estado-servidor"
        className={
          servidor === 'ok'
            ? 'rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm text-emerald-300'
            : servidor === 'caido'
              ? 'rounded-full bg-rose-500/15 px-4 py-1.5 text-sm text-rose-300'
              : 'rounded-full bg-slate-500/15 px-4 py-1.5 text-sm text-slate-300'
        }
      >
        {etiquetaServidor}
      </p>
    </main>
  );
}
