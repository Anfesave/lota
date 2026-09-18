import { MAX_NUMBER, MIN_NUMBER } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';

const TODOS = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

/** Tablero de 90 numeros con los ya cantados resaltados. */
export function Tablero({ cantados, ultimo }: { cantados: ReadonlySet<number>; ultimo?: number }) {
  return (
    <section
      aria-label={t.partida.tablero}
      className="grid grid-cols-10 gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
    >
      {TODOS.map((numero) => {
        const salio = cantados.has(numero);
        return (
          <span
            key={numero}
            data-cantado={salio ? 'si' : 'no'}
            className={[
              'flex aspect-square items-center justify-center rounded text-[11px] font-semibold tabular-nums sm:text-xs',
              numero === ultimo
                ? 'bg-lota-oro text-slate-900 ring-2 ring-lota-oro/60'
                : salio
                  ? 'bg-lota-oro/25 text-lota-oro'
                  : 'bg-slate-800/60 text-slate-600',
            ].join(' ')}
          >
            {numero}
          </span>
        );
      })}
    </section>
  );
}
