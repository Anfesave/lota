import { CARD_COLUMNS, equippedData, type Card, type CosmeticData } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';

interface CartonProps {
  carton: Card;
  indice: number;
  marcados: ReadonlySet<number>;
  autoMarcado: boolean;
  onMarcar: (numero: number) => void;
  /** Cosméticos del dueño del cartón: tema y ficha. */
  equipped?: Record<string, string>;
}

/** Forma de la ficha con la que se marca, según el cosmético equipado. */
function claseDeFicha(forma: CosmeticData['forma']): string {
  if (forma === 'estrella') {
    return '[clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]';
  }
  if (forma === 'tapa') return 'rounded-full ring-2 ring-white/40 ring-inset';
  if (forma === 'poroto') return 'rounded-[45%_55%_50%_50%/60%_45%_55%_40%]';
  return 'rounded-full';
}

/**
 * Cartón de 3x9. El jugador marca pulsando el número.
 *
 * Los números que ya salieron **no** se resaltan a propósito: hay que estar
 * atento al locutor y al tablero, como en la lota de verdad. El cartón solo
 * muestra lo que uno mismo marcó.
 */
export function Carton({
  carton,
  indice,
  marcados,
  autoMarcado,
  onMarcar,
  equipped = {},
}: CartonProps) {
  const tema = equippedData(equipped, 'CARTON_THEME') ?? {};
  const ficha = equippedData(equipped, 'MARKER') ?? {};

  const fondo = tema.fondo ?? '#fdf6e3';
  const colorNumero = tema.numero ?? '#334155';
  const colorMarca = ficha.marca ?? '#e11d48';

  return (
    <div
      className="rounded-xl border border-black/10 p-1.5 shadow-lg"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${CARD_COLUMNS}, minmax(0, 1fr))`,
        gap: '2px',
        backgroundColor: fondo,
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

          return (
            <button
              key={clave}
              type="button"
              disabled={autoMarcado}
              onClick={() => onMarcar(casilla)}
              aria-pressed={marcado}
              className={[
                'relative aspect-square rounded text-sm font-bold tabular-nums transition sm:text-base',
                autoMarcado ? '' : 'hover:brightness-95',
              ].join(' ')}
              style={{ color: marcado ? '#ffffff' : colorNumero }}
            >
              {marcado ? (
                <span
                  aria-hidden
                  className={`absolute inset-[6%] ${claseDeFicha(ficha.forma)}`}
                  style={{ backgroundColor: colorMarca }}
                />
              ) : null}
              <span className="relative">{casilla}</span>
            </button>
          );
        }),
      )}
    </div>
  );
}
