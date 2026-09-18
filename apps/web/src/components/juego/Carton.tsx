import { CARD_COLUMNS, type Card } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';

interface CartonProps {
  carton: Card;
  indice: number;
  marcados: ReadonlySet<number>;
  cantados: ReadonlySet<number>;
  autoMarcado: boolean;
  onMarcar: (numero: number) => void;
}

/**
 * Carton de 3x9. El jugador marca pulsando el numero, como en la lota real.
 * Con `autoMarcado` las casillas no son pulsables porque marca el sistema.
 */
export function Carton({ carton, indice, marcados, cantados, autoMarcado, onMarcar }: CartonProps) {
  return (
    <div
      className="rounded-xl border border-lota-carton/20 bg-lota-carton p-1.5 shadow-lg"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${CARD_COLUMNS}, minmax(0, 1fr))`,
        gap: '2px',
      }}
      aria-label={t.partida.cartonNumero(indice + 1)}
      role="group"
    >
      {carton.flatMap((fila, numeroFila) =>
        fila.map((casilla, columna) => {
          const clave = `${numeroFila}-${columna}`;
          if (casilla === null) {
            return <span key={clave} className="aspect-square rounded bg-black/5" aria-hidden />;
          }

          const marcado = marcados.has(casilla);
          const disponible = cantados.has(casilla);

          return (
            <button
              key={clave}
              type="button"
              disabled={autoMarcado}
              onClick={() => onMarcar(casilla)}
              aria-pressed={marcado}
              className={[
                'aspect-square rounded text-sm font-bold tabular-nums transition sm:text-base',
                marcado
                  ? 'bg-lota-acento text-white'
                  : disponible
                    ? 'bg-amber-200 text-slate-900'
                    : 'bg-white text-slate-700',
                autoMarcado ? '' : 'hover:brightness-95',
              ].join(' ')}
            >
              {casilla}
            </button>
          );
        }),
      )}
    </div>
  );
}
