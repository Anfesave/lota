import { formatPesos, type LobbyStateView } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';

interface CuentasProps {
  estado: LobbyStateView;
  /** Versión apretada, para meterla dentro de la pantalla de victoria. */
  compacto?: boolean;
}

/**
 * Cuentas de la sala a lo largo de las partidas: quién ha ganado, cuánto puso
 * cada uno y cómo va su balance. Es el papelito de la mesa, y se actualiza
 * solo al terminar cada partida.
 *
 * Vive con la sala, en memoria: si la sala se cierra, se cierra la cuenta.
 */
export function Cuentas({ estado, compacto = false }: CuentasProps) {
  // Sin apuestas de por medio las columnas de plata serían una pared de $0,
  // así que solo se muestran cuando ha habido pozo alguna vez.
  const conPlata = estado.pozoAcumulado > 0 || estado.settings.apuestas;

  if (estado.partidasJugadas === 0) {
    if (compacto) return null;
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="mb-2 font-bold text-slate-100">{t.cuentas.titulo}</h3>
        <p className="text-sm text-slate-500">{t.cuentas.sinPartidas}</p>
      </section>
    );
  }

  return (
    <section
      className={
        compacto
          ? 'w-full rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-left'
          : 'rounded-2xl border border-slate-800 bg-slate-900/60 p-5'
      }
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-slate-100">{t.cuentas.titulo}</h3>
        <p className="text-xs text-slate-500">
          {conPlata
            ? t.cuentas.resumen(estado.partidasJugadas, formatPesos(estado.pozoAcumulado))
            : t.cuentas.resumenSinPlata(estado.partidasJugadas)}
        </p>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="pb-2 font-medium">
              {t.cuentas.jugador}
            </th>
            <th scope="col" className="pb-2 text-center font-medium">
              {t.cuentas.ganadas}
            </th>
            {conPlata ? (
              <>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t.cuentas.puesto}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t.cuentas.llevado}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t.cuentas.balance}
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {estado.tally.map((fila) => (
            <tr key={fila.userId} className="border-t border-slate-800/70">
              <th scope="row" className="py-1.5 text-left font-medium text-slate-200">
                {fila.username}
              </th>
              <td className="py-1.5 text-center tabular-nums text-slate-400">
                {fila.ganadas}/{fila.partidas}
              </td>
              {conPlata ? (
                <>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">
                    {formatPesos(fila.apostado)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">
                    {formatPesos(fila.ganado)}
                  </td>
                  <td
                    className={[
                      'py-1.5 text-right font-bold tabular-nums',
                      fila.balance > 0
                        ? 'text-emerald-300'
                        : fila.balance < 0
                          ? 'text-rose-300'
                          : 'text-slate-500',
                    ].join(' ')}
                  >
                    {fila.balance > 0 ? '+' : ''}
                    {formatPesos(fila.balance)}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {conPlata && !compacto ? (
        <p className="mt-3 text-xs text-slate-600">{t.cuentas.recordatorio}</p>
      ) : null}
    </section>
  );
}
