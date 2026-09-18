import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Campo } from '../components/Campo.js';
import { PantallaAuth } from '../components/PantallaAuth.js';
import { t } from '../i18n/es-CL.js';
import { ApiError } from '../lib/api.js';
import { useAuthStore } from '../stores/auth.js';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = useAuthStore((estado) => estado.entrar);
  const navigate = useNavigate();
  const location = useLocation();

  // Volver a donde el usuario queria ir (p. ej. un link de invitacion).
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/';

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar({ username, password });
      navigate(destino, { replace: true });
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAuth
      titulo={t.auth.entrarTitulo}
      error={error}
      pie={
        <>
          {t.auth.sinCuenta}{' '}
          <Link to="/registro" className="font-semibold text-lota-oro hover:underline">
            {t.auth.creaUna}
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Campo
          etiqueta={t.auth.usuario}
          valor={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <Campo
          etiqueta={t.auth.contrasena}
          tipo="password"
          valor={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={enviando}
          className="mt-1 rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {enviando ? t.auth.entrando : t.auth.botonEntrar}
        </button>
      </form>
    </PantallaAuth>
  );
}

export function mensajeDeError(fallo: unknown): string {
  if (!(fallo instanceof ApiError)) return t.comun.errorGenerico;
  // El 429 lo genera @fastify/rate-limit y trae un mensaje en ingles.
  if (fallo.status === 429) return t.auth.demasiadosIntentos;
  return fallo.message;
}
