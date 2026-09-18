import { MAX_VICTORY_MESSAGE_LENGTH, USERNAME_MAX_LENGTH, registerSchema } from '@lota/shared';
import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Campo } from '../components/Campo.js';
import { PantallaAuth } from '../components/PantallaAuth.js';
import { t } from '../i18n/es-CL.js';
import { useAuthStore } from '../stores/auth.js';
import { mensajeDeError } from './Login.js';

export function Registro() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [victoryMessage, setVictoryMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const registrarse = useAuthStore((estado) => estado.registrarse);
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/';

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);

    // Validamos con el mismo esquema Zod que usa el servidor: el error sale
    // al tiro, sin ida y vuelta, y no hay dos reglas que puedan divergir.
    const parsed = registerSchema.safeParse({ username, password, victoryMessage });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t.comun.errorGenerico);
      return;
    }

    setEnviando(true);
    try {
      await registrarse(parsed.data);
      navigate(destino, { replace: true });
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAuth
      titulo={t.auth.registrarTitulo}
      error={error}
      pie={
        <>
          {t.auth.yaTengoCuenta}{' '}
          <Link to="/entrar" className="font-semibold text-lota-oro hover:underline">
            {t.auth.entraAqui}
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Campo
          etiqueta={t.auth.usuario}
          ayuda={t.auth.usuarioAyuda}
          valor={username}
          onChange={setUsername}
          autoComplete="username"
          maxLength={USERNAME_MAX_LENGTH}
        />
        <Campo
          etiqueta={t.auth.contrasena}
          ayuda={t.auth.contrasenaAyuda}
          tipo="password"
          valor={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Campo
          etiqueta={t.auth.mensajeVictoria}
          ayuda={t.auth.mensajeVictoriaAyuda}
          valor={victoryMessage}
          onChange={setVictoryMessage}
          maxLength={MAX_VICTORY_MESSAGE_LENGTH}
          placeholder={t.auth.mensajeVictoriaEjemplo}
        />
        <button
          type="submit"
          disabled={enviando}
          className="mt-1 rounded-lg bg-lota-acento px-4 py-2.5 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {enviando ? t.auth.creando : t.auth.botonRegistrar}
        </button>
      </form>
    </PantallaAuth>
  );
}
