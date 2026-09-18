import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RutaProtegida } from './components/RutaProtegida.js';
import { Inicio } from './pages/Inicio.js';
import { Login } from './pages/Login.js';
import { Registro } from './pages/Registro.js';
import { useAuthStore } from './stores/auth.js';

export function App() {
  const cargarSesion = useAuthStore((estado) => estado.cargarSesion);
  const user = useAuthStore((estado) => estado.user);
  const estado = useAuthStore((estado) => estado.estado);

  // Una sola consulta a /me al arrancar: a partir de ahi el store manda.
  useEffect(() => {
    void cargarSesion();
  }, [cargarSesion]);

  const yaEntro = estado === 'listo' && user !== null;

  return (
    <Routes>
      <Route
        path="/"
        element={
          <RutaProtegida>
            <Inicio />
          </RutaProtegida>
        }
      />
      {/* Si ya hay sesion, entrar y registro no tienen sentido. */}
      <Route path="/entrar" element={yaEntro ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/registro" element={yaEntro ? <Navigate to="/" replace /> : <Registro />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
