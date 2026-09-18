import { dichoPara } from '@lota/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/es-CL.js';
import { crearAnnouncer, type Announcer } from '../../lib/announcer.js';
import { useLobbyStore } from '../../stores/lobby.js';

const CLAVE_SILENCIO = 'lota:locutor:silenciado';
const CLAVE_VOLUMEN = 'lota:locutor:volumen';

export interface EstadoLocutor {
  disponible: boolean;
  silenciado: boolean;
  volumen: number;
  /** false hasta que el usuario toca el botón; iOS lo exige. */
  desbloqueado: boolean;
  /** Dicho del número actual, si la sala los tiene activados. */
  dicho: string | undefined;
  setSilenciado: (valor: boolean) => void;
  setVolumen: (valor: number) => void;
  desbloquear: () => void;
}

function leerPreferencia<T>(clave: string, porDefecto: T, convertir: (bruto: string) => T): T {
  try {
    const guardado = localStorage.getItem(clave);
    return guardado === null ? porDefecto : convertir(guardado);
  } catch {
    // Sin acceso a localStorage (modo privado) se usa el valor por defecto.
    return porDefecto;
  }
}

function guardarPreferencia(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Que no se pueda recordar la preferencia no debe romper nada.
  }
}

/**
 * Conecta el locutor con la partida: cada número que llega se canta en voz
 * alta. El volumen y el silencio son **locales**: no afectan a los demás
 * jugadores (PLAN.md sección 8).
 */
export function useLocutor(): EstadoLocutor {
  const ultimoNumero = useLobbyStore((s) => s.ultimoNumero);
  const estado = useLobbyStore((s) => s.estado);
  const conDichos = estado?.settings.dichos ?? false;

  const announcer = useRef<Announcer>(undefined as unknown as Announcer);
  announcer.current ??= crearAnnouncer();

  const [silenciado, setSilenciadoEstado] = useState(() =>
    leerPreferencia(CLAVE_SILENCIO, false, (bruto) => bruto === 'true'),
  );
  const [volumen, setVolumenEstado] = useState(() =>
    leerPreferencia(CLAVE_VOLUMEN, 1, (bruto) => Number(bruto)),
  );
  const [desbloqueado, setDesbloqueado] = useState(false);

  // El dicho se elige una vez por número, no en cada render.
  const dicho = useMemo(() => {
    if (!conDichos || !ultimoNumero) return undefined;
    return dichoPara(ultimoNumero.number, (max) => Math.floor(Math.random() * max));
  }, [conDichos, ultimoNumero]);

  useEffect(() => {
    announcer.current.configurar({ volumen, silenciado });
  }, [volumen, silenciado]);

  useEffect(() => {
    if (!ultimoNumero || silenciado) return;
    // El texto se muestra siempre; la voz es un extra que se puede apagar.
    announcer.current.cantar(dicho ? `${ultimoNumero.number}. ${dicho}` : `${ultimoNumero.number}`);
  }, [ultimoNumero, dicho, silenciado]);

  // Al salir de la pantalla, que no siga hablando.
  useEffect(() => {
    const actual = announcer.current;
    return () => actual.callar();
  }, []);

  const setSilenciado = useCallback((valor: boolean) => {
    setSilenciadoEstado(valor);
    guardarPreferencia(CLAVE_SILENCIO, String(valor));
  }, []);

  const setVolumen = useCallback((valor: number) => {
    setVolumenEstado(valor);
    guardarPreferencia(CLAVE_VOLUMEN, String(valor));
  }, []);

  const desbloquear = useCallback(() => {
    announcer.current.desbloquear();
    setDesbloqueado(true);
  }, []);

  return {
    disponible: announcer.current.disponible,
    silenciado,
    volumen,
    desbloqueado,
    dicho,
    setSilenciado,
    setVolumen,
    desbloquear,
  };
}

/** Controles locales de voz: silencio y volumen. */
export function ControlesLocutor({ locutor }: { locutor: EstadoLocutor }) {
  if (!locutor.disponible) {
    return <p className="text-center text-xs text-slate-600">{t.locutor.sinVoz}</p>;
  }

  // iOS exige un gesto del usuario antes de dejar sonar nada.
  if (!locutor.desbloqueado) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={locutor.desbloquear}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          {t.locutor.activarSonido}
        </button>
        <p className="text-center text-xs text-slate-600">{t.locutor.activarSonidoAyuda}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        onClick={() => locutor.setSilenciado(!locutor.silenciado)}
        aria-pressed={locutor.silenciado}
        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
      >
        {locutor.silenciado ? t.locutor.activar : t.locutor.silenciar}
      </button>

      <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">
        <span className="sr-only">{t.locutor.volumen}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={locutor.volumen}
          disabled={locutor.silenciado}
          onChange={(evento) => locutor.setVolumen(Number(evento.target.value))}
          aria-label={t.locutor.volumen}
          className="w-full accent-lota-oro disabled:opacity-40"
        />
      </label>
    </div>
  );
}
