import type { LoteroId, NumberCalled } from '@lota/shared';
import type { ReactNode } from 'react';
import { t } from '../../i18n/es-CL.js';
import { Lotera } from './Lotera.js';

interface BolaProps {
  ultimo: NumberCalled | null;
  anteriores: number[];
  cuantosCantados: number;
  /** Controles del locutor; se rellenan en la Fase 5. */
  controles?: ReactNode;
  /** Dicho tradicional asociado al numero, si la sala los tiene activados. */
  dicho?: string | undefined;
  /** La gata que canta esta partida. */
  lotero?: LoteroId | undefined;
}

/** Bola grande con el numero actual y las ultimas que salieron. */
export function Bola({ ultimo, anteriores, cuantosCantados, controles, dicho, lotero }: BolaProps) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <Lotera id={lotero} cantando={ultimo !== null} />

      {ultimo ? (
        <div
          // La `key` fuerza a React a recrear el nodo en cada numero, que es lo
          // que hace que la animacion de entrada se vea en cada bola.
          key={ultimo.index}
          data-testid="bola-actual"
          className="flex size-28 animate-[bola_400ms_ease-out] items-center justify-center rounded-full bg-lota-oro text-5xl font-black tabular-nums text-slate-900 shadow-xl sm:size-32 sm:text-6xl"
        >
          {ultimo.number}
        </div>
      ) : (
        <p className="py-10 text-center text-slate-400">{t.partida.esperandoPrimero}</p>
      )}

      {dicho ? <p className="text-center text-sm italic text-lota-oro/80">{dicho}</p> : null}

      {anteriores.length > 0 ? (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {t.partida.ultimas}
          </span>
          <ul className="flex gap-1.5">
            {anteriores.map((numero) => (
              <li
                key={numero}
                className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-sm font-bold tabular-nums text-slate-300"
              >
                {numero}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">{t.partida.vanCantados(cuantosCantados)}</p>

      {controles}
    </section>
  );
}
