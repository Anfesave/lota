import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { RutaProtegida } from './components/RutaProtegida.js';
import { Lobby } from './pages/Lobby.js';
import { Login } from './pages/Login.js';
import { Perfil } from './pages/Perfil.js';
import { Registro } from './pages/Registro.js';
import { Sala } from './pages/Sala.js';
import { Tienda } from './pages/Tienda.js';
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
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        <Route path="/" element={<Lobby />} />
        <Route path="/sala/:code" element={<Sala />} />
        <Route path="/tienda" element={<Tienda />} />
        <Route path="/perfil" element={<Perfil />} />
      </Route>

      {/* Si ya hay sesion, entrar y registro no tienen sentido. */}
      <Route path="/entrar" element={yaEntro ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/registro" element={yaEntro ? <Navigate to="/" replace /> : <Registro />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
