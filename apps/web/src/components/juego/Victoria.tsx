import { formatPesos, type GameFinished, type LobbyStateView } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';
import { Carton } from './Carton.js';
import { Cuentas } from './Cuentas.js';

interface VictoriaProps {
  final: GameFinished;
  /** Estado de la sala, para mostrar las cuentas acumuladas aquí mismo. */
  estado: LobbyStateView;
  /** Id de quien mira, para decirle lo que se llevó él. */
  miId: string;
  onVolver: () => void;
  onSalir: () => void;
}

/**
 * Overlay de victoria: lo ven todos, no solo quien ganó. Muestra el mensaje de
 * victoria del ganador y el cartón con el que ganó.
 */
export function Victoria({ final, estado, miId, onVolver, onSalir }: VictoriaProps) {
  // Viene de la red: un servidor viejo podría no mandarlo durante un deploy.
  const misMonedas = final.coinsByUser?.[miId] ?? 0;
  const gane = final.winners.some((ganador) => ganador.userId === miId);
  const cantados = new Set(final.drawn);
  const hayGanadores = final.winners.length > 0;
  const pozoRepartido = final.winners.length > 1 && (final.winners[0]?.potWon ?? 0) > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={hayGanadores ? t.victoria.titulo : t.victoria.sinGanador}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4"
    >
      <div className="my-auto flex w-full max-w-lg flex-col items-center gap-5 rounded-2xl border border-lota-oro/30 bg-slate-900 p-6 text-center shadow-2xl">
        <h2 className="text-3xl font-black tracking-tight text-lota-oro sm:text-4xl">
          {hayGanadores
            ? final.winners.length > 1
              ? t.victoria.tituloEmpate
              : t.victoria.titulo
            : t.victoria.sinGanador}
        </h2>

        {!hayGanadores ? (
          <p className="text-slate-400">{t.victoria.sinGanadorDetalle}</p>
        ) : (
          <ul className="flex w-full flex-col gap-5">
            {final.winners.map((ganador) => (
              <li key={ganador.userId} className="flex flex-col items-center gap-2">
                <p className="text-xl font-bold text-slate-100">{ganador.username}</p>
                <p className="text-balance text-lg text-slate-300">
                  &ldquo;{ganador.victoryMessage}&rdquo;
                </p>

                {ganador.potWon > 0 ? (
                  <p className="rounded-full bg-lota-oro/15 px-4 py-1.5 text-lg font-black text-lota-oro">
                    {t.victoria.seLlevaElPozo(formatPesos(ganador.potWon))}
                  </p>
                ) : null}

                <p className="text-sm text-slate-500">
                  {ganador.coinsWon > 0
                    ? t.victoria.monedas(ganador.coinsWon)
                    : t.victoria.sinMonedas}
                </p>

                <div className="w-full max-w-sm">
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                    {t.victoria.cartonGanador}
                  </p>
                  <Carton
                    carton={ganador.card}
                    indice={0}
                    marcados={cantados}
                    autoMarcado
                    onMarcar={() => undefined}
                    equipped={ganador.equipped}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {misMonedas > 0 && !gane ? (
          <p className="rounded-full bg-lota-oro/10 px-4 py-1.5 text-sm font-semibold text-lota-oro">
            {t.victoria.tuParte(misMonedas)}
          </p>
        ) : null}

        {pozoRepartido ? (
          <p className="text-xs text-slate-500">{t.victoria.pozoEntreVarios}</p>
        ) : null}

        {/* Cómo va la mesa tras esta partida, sin tener que cerrar nada. */}
        <Cuentas estado={estado} compacto />

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110"
          >
            {t.victoria.volverALaSala}
          </button>
          <button
            type="button"
            onClick={onSalir}
            className="rounded-lg border border-slate-700 px-4 py-2.5 font-bold text-slate-300 transition hover:bg-slate-800"
          >
            {t.victoria.salir}
          </button>
        </div>
      </div>
    </div>
  );
}
