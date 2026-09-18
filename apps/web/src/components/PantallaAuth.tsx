import type { ReactNode } from 'react';
import { t } from '../i18n/es-CL.js';

interface PantallaAuthProps {
  titulo: string;
  error?: string | null;
  children: ReactNode;
  pie: ReactNode;
}

/** Marco comun de las pantallas de entrar y registrarse. */
export function PantallaAuth({ titulo, error, children, pie }: PantallaAuthProps) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-black tracking-tight text-lota-oro">{t.app.nombre}</h1>
        <p className="mt-1 text-sm text-slate-400">{t.app.lema}</p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <h2 className="mb-5 text-center text-xl font-bold text-slate-100">{titulo}</h2>

        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}

        {children}
      </section>

      <p className="text-center text-sm text-slate-400">{pie}</p>
    </main>
  );
}
