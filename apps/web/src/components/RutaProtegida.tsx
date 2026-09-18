import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { t } from '../i18n/es-CL.js';
import { useAuthStore } from '../stores/auth.js';

/**
 * Envuelve las rutas que exigen sesion. Guarda la ruta pedida en el estado de
 * navegacion para volver a ella tras entrar: es lo que hara funcionar los links
 * de invitacion a una sala (`/sala/<code>`) en la Fase 3.
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const user = useAuthStore((estado) => estado.user);
  const estado = useAuthStore((estado) => estado.estado);
  const location = useLocation();

  if (estado === 'cargando') {
    return (
      <p role="status" className="py-16 text-center text-slate-400">
        {t.comun.cargando}
      </p>
    );
  }

  if (!user) {
    return <Navigate to="/entrar" replace state={{ desde: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
