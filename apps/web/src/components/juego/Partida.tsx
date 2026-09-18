import type { ClaimType, LobbyStateView } from '@lota/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { t } from '../../i18n/es-CL.js';
import { useLobbyStore } from '../../stores/lobby.js';
import { Bola } from './Bola.js';
import { Carton } from './Carton.js';
import { Tablero } from './Tablero.js';

/**
 * Segundos que faltan hasta una marca de tiempo. El valor se calcula en cada
 * render y el temporizador solo fuerza el repintado: guardarlo en estado lo
 * dejaría desfasado justo en el render en que cambia `hasta`.
 */
export function useSegundosRestantes(hasta: number | undefined): number {
  const [, repintar] = useState(0);

  useEffect(() => {
    if (hasta === undefined) return;
    const temporizador = setInterval(() => repintar((n) => n + 1), 500);
    return () => clearInterval(temporizador);
  }, [hasta]);

  return calcular(hasta);
}

function calcular(hasta: number | undefined): number {
  if (hasta === undefined) return 0;
  return Math.max(0, Math.ceil((hasta - Date.now()) / 1000));
}

interface PartidaProps {
  estado: LobbyStateView;
  /** Controles del locutor, que aporta la Fase 5. */
  controlesLocutor?: ReactNode;
  dicho?: string | undefined;
}

export function Partida({ estado, controlesLocutor, dicho }: PartidaProps) {
  const cuentaAtras = useLobbyStore((s) => s.cuentaAtras);
  const ultimoNumero = useLobbyStore((s) => s.ultimoNumero);
  const ganadoresLinea = useLobbyStore((s) => s.ganadoresLinea);
  const cantadosLista = useLobbyStore((s) => s.cantados);
  const marcasLista = useLobbyStore((s) => s.marcas);
  const rechazo = useLobbyStore((s) => s.rechazo);
  const marcar = useLobbyStore((s) => s.marcar);
  const cantar = useLobbyStore((s) => s.cantar);
  const limpiarRechazo = useLobbyStore((s) => s.limpiarRechazo);

  const cantados = new Set(cantadosLista);
  const marcados = new Set(marcasLista);
  const bloqueadoHasta = rechazo?.blockedUntil ?? estado.yourClaimBlockedUntil;
  const segundosBloqueado = useSegundosRestantes(bloqueadoHasta);
  const bloqueado = segundosBloqueado > 0;

  // El aviso de lota rechazada se va solo cuando termina el bloqueo. Se mide
  // contra el reloj, no contra el contador: en el render en que llega el
  // rechazo el contador todavía vale 0 y el aviso desaparecería sin verse.
  useEffect(() => {
    if (!rechazo) return;

    const restanteMs = rechazo.blockedUntil - Date.now();
    if (restanteMs <= 0) {
      limpiarRechazo();
      return;
    }

    const temporizador = setTimeout(limpiarRechazo, restanteMs);
    return () => clearTimeout(temporizador);
  }, [rechazo, limpiarRechazo]);

  if (estado.status === 'COUNTDOWN') {
    return (
      <p role="status" className="py-24 text-center text-4xl font-black text-lota-oro">
        {cuentaAtras !== null && cuentaAtras > 0
          ? t.partida.comienzaEn(cuentaAtras)
          : t.partida.comenzamos}
      </p>
    );
  }

  const lineaCerrada = estado.lineWinnerIds.length > 0;
  const juegaLinea = estado.settings.prizeMode === 'LINEA_Y_CARTON';

  async function cantarY(tipo: ClaimType, indice: number) {
    await cantar(tipo, indice);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <Bola
          ultimo={ultimoNumero}
          anteriores={cantadosLista.slice(-6, -1).reverse()}
          cuantosCantados={cantadosLista.length}
          controles={controlesLocutor}
          dicho={dicho}
        />
        <Tablero cantados={cantados} ultimo={ultimoNumero?.number} />
      </div>

      {ganadoresLinea.length > 0 ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-200"
        >
          {t.partida.lineaGanada(ganadoresLinea.map((g) => g.username).join(', '))}
        </p>
      ) : null}

      {rechazo ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-200"
        >
          {rechazo.reason} {bloqueado ? t.partida.bloqueadoSegundos(segundosBloqueado) : ''}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="font-bold text-slate-100">
          {t.partida.misCartones}
          {estado.settings.autoMark ? (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {t.partida.autoMarcadoActivo}
            </span>
          ) : null}
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {estado.yourCards.map((carton, indice) => (
            <div key={indice} className="flex flex-col gap-2">
              <Carton
                carton={carton}
                indice={indice}
                marcados={marcados}
                cantados={cantados}
                autoMarcado={estado.settings.autoMark}
                onMarcar={(numero) => void marcar(indice, numero)}
              />

              <div className="flex gap-2">
                {juegaLinea ? (
                  <button
                    type="button"
                    disabled={bloqueado || lineaCerrada}
                    onClick={() => void cantarY('LINE', indice)}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 font-black text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {lineaCerrada ? t.partida.lineaYaGanada : t.partida.cantarLinea}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={() => void cantarY('FULL', indice)}
                  className="flex-1 rounded-lg bg-lota-acento px-3 py-2.5 font-black text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {bloqueado
                    ? t.partida.bloqueadoSegundos(segundosBloqueado)
                    : t.partida.cantarLota}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
