import { MAX_PLAYERS } from '@lota/shared';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/es-CL.js';
import { useAuthStore } from '../stores/auth.js';

/**
 * Pantalla principal tras iniciar sesion. En la Fase 3 la reemplaza el lobby
 * con el listado de salas publicas y el boton de crear sala.
 */
export function Inicio() {
  const user = useAuthStore((estado) => estado.user);
  const salir = useAuthStore((estado) => estado.salir);
  const navigate = useNavigate();

  if (!user) return null;

  async function cerrarSesion() {
    await salir();
    navigate('/entrar', { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-lota-oro">{t.app.nombre}</h1>
          <p className="text-sm text-slate-400">{t.inicio.saludo(user.username)}</p>
        </div>
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
        >
          {t.auth.salir}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {t.inicio.monedasEtiqueta}
            </dt>
            <dd className="text-2xl font-bold text-lota-oro">{user.coins}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t.inicio.tuMensaje}</dt>
            <dd className="break-words text-lg text-slate-200">{user.victoryMessage}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-700 p-5 text-center">
        <p className="font-semibold text-slate-300">{t.inicio.proximamente}</p>
        <p className="mt-1 text-sm text-slate-500">{t.inicio.proximamenteDetalle}</p>
        <p className="mt-3 text-xs text-slate-600">{t.inicio.resumenJuego(MAX_PLAYERS)}</p>
      </section>
    </main>
  );
}
