import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { t } from '../i18n/es-CL.js';
import { useAuthStore } from '../stores/auth.js';

/**
 * Envuelve las rutas que exigen sesión. Guarda la ruta pedida en el estado de
 * navegación para volver a ella tras entrar: es lo que hace funcionar los
 * links de invitación a una sala (`/sala/<code>`).
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const user = useAuthStore((estado) => estado.user);
  const estado = useAuthStore((estado) => estado.estado);
  const errorSesion = useAuthStore((estado) => estado.errorSesion);
  const cargarSesion = useAuthStore((estado) => estado.cargarSesion);
  const location = useLocation();

  if (estado === 'cargando') {
    return (
      <p role="status" className="py-16 text-center text-slate-400">
        {t.comun.cargando}
      </p>
    );
  }

  // Si el servidor no contestó no sabemos si hay sesión o no. Mandar a login
  // sería mentir: con el plan Free de Render el servicio puede estar
  // despertando y basta con reintentar.
  if (!user && errorSesion) {
    return (
      <main className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-20 text-center">
        <p role="alert" className="text-amber-200">
          {t.comun.servidorDespertando}
        </p>
        <button
          type="button"
          onClick={() => void cargarSesion()}
          className="rounded-lg bg-lota-acento px-4 py-2 font-bold text-white transition hover:brightness-110"
        >
          {t.comun.reintentar}
        </button>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/entrar" replace state={{ desde: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
