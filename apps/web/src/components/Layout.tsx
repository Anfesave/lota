import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { t } from '../i18n/es-CL.js';
import { asegurarConexion } from '../lib/socket.js';
import { useAuthStore } from '../stores/auth.js';
import { useLobbyStore } from '../stores/lobby.js';

/** Marco de las pantallas con sesión iniciada: cabecera y avisos. */
export function Layout() {
  const user = useAuthStore((estado) => estado.user);
  const salir = useAuthStore((estado) => estado.salir);
  const escuchar = useLobbyStore((estado) => estado.escuchar);
  const navigate = useNavigate();
  const location = useLocation();

  // Un solo socket para toda la sesión, conectado en cuanto hay usuario.
  useEffect(() => {
    if (user) escuchar();
  }, [user, escuchar]);

  /**
   * Al cambiar de aplicación en el teléfono, el navegador suspende la página y
   * se cae el socket. Cuando vuelve a verse hay que empujar la reconexión: los
   * reintentos de socket.io estaban congelados con ella. El servidor guarda el
   * sitio un minuto, así que el jugador vuelve a su sala sin enterarse.
   */
  useEffect(() => {
    if (!user) return;

    const alVolver = () => {
      if (document.visibilityState === 'visible') asegurarConexion();
    };

    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    // `pageshow` cubre volver atrás desde la caché del navegador móvil.
    window.addEventListener('pageshow', alVolver);

    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('pageshow', alVolver);
    };
  }, [user]);

  const avisoDeNavegacion = (location.state as { aviso?: string } | null)?.aviso ?? null;
  const [aviso, setAviso] = useState<string | null>(avisoDeNavegacion);

  useEffect(() => {
    setAviso(avisoDeNavegacion);
  }, [avisoDeNavegacion]);

  if (!user) return null;

  async function cerrarSesion() {
    await salir();
    navigate('/entrar', { replace: true });
  }

  return (
    <div className="min-h-full">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <Link to="/" className="text-xl font-black tracking-tight text-lota-oro">
          {t.app.nombre}
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link to="/tienda" className="text-slate-300 hover:text-lota-oro">
            {t.tienda.enlace}
          </Link>
          <Link to="/perfil" className="text-slate-300 hover:text-lota-oro">
            {t.perfil.enlace}
          </Link>
          <span className="text-slate-400">{t.inicio.saludo(user.username)}</span>
          <span className="rounded-full bg-lota-oro/15 px-2.5 py-0.5 font-semibold text-lota-oro">
            {user.coins}
          </span>
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-800"
          >
            {t.auth.salir}
          </button>
        </div>
      </header>

      {aviso ? (
        <p
          role="alert"
          className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          {aviso}
        </p>
      ) : null}

      <Outlet />
    </div>
  );
}
