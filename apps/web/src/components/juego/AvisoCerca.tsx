import type { PlayerCloseToWin } from '@lota/shared';
import { useEffect } from 'react';
import { t } from '../../i18n/es-CL.js';
import { useLobbyStore } from '../../stores/lobby.js';

/** Cuánto se queda en pantalla el aviso antes de irse solo. */
const DURACION_MS = 4_000;

/**
 * Aviso emergente de que a alguien le quedan pocos números. Lo ve toda la
 * sala: saber que al de al lado le falta uno es media gracia del juego.
 */
export function AvisoCerca({ aviso }: { aviso: PlayerCloseToWin }) {
  const limpiar = useLobbyStore((s) => s.limpiarCerca);

  useEffect(() => {
    const temporizador = setTimeout(limpiar, DURACION_MS);
    return () => clearTimeout(temporizador);
  }, [aviso, limpiar]);

  const urgente = aviso.remaining === 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4"
    >
      <p
        className={[
          'pointer-events-auto animate-[aviso_300ms_ease-out] rounded-full border px-5 py-2.5 text-center text-sm font-bold shadow-xl sm:text-base',
          urgente
            ? 'border-lota-acento/50 bg-lota-acento text-white'
            : 'border-lota-oro/40 bg-slate-900 text-lota-oro',
        ].join(' ')}
      >
        {t.partida.leFaltan(aviso.username, aviso.remaining)}
      </p>
    </div>
  );
}
