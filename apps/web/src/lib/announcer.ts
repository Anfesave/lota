/**
 * El locutor que canta los números.
 *
 * La interfaz está pensada para dos implementaciones: la de hoy, con la Web
 * Speech API del navegador, y la de producción, con 90 clips pregrabados
 * (PLAN.md sección 8). Quien la use no debería notar la diferencia.
 */
export interface Announcer {
  /** false si el navegador no tiene con qué hablar. */
  readonly disponible: boolean;
  /**
   * iOS no deja sonar nada hasta que el usuario toca algo. Hay que llamarlo
   * desde un gesto real (un click), no al cargar la página.
   */
  desbloquear(): void;
  cantar(texto: string): void;
  callar(): void;
  configurar(opciones: { volumen: number; silenciado: boolean }): void;
}

/** Locutor que no hace nada: para entornos sin voz, como los tests. */
export const announcerMudo: Announcer = {
  disponible: false,
  desbloquear: () => undefined,
  cantar: () => undefined,
  callar: () => undefined,
  configurar: () => undefined,
};

/** Preferencia de voz: chilena, luego latinoamericana, luego cualquier español. */
function elegirVoz(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const porPrefijo = (prefijo: string) =>
    voces.find((voz) => voz.lang.toLowerCase().replace('_', '-').startsWith(prefijo));

  return porPrefijo('es-cl') ?? porPrefijo('es-419') ?? porPrefijo('es');
}

class WebSpeechAnnouncer implements Announcer {
  readonly disponible = true;

  #voz: SpeechSynthesisVoice | undefined;
  #volumen = 1;
  #silenciado = false;
  #desbloqueado = false;

  constructor(private readonly sintesis: SpeechSynthesis) {
    this.#refrescarVoz();
    // Chrome carga las voces de forma asíncrona: hay que esperar el evento.
    this.sintesis.addEventListener?.('voiceschanged', () => this.#refrescarVoz());
  }

  #refrescarVoz(): void {
    this.#voz = elegirVoz(this.sintesis.getVoices());
  }

  desbloquear(): void {
    if (this.#desbloqueado) return;
    this.#desbloqueado = true;

    // Un enunciado vacío dentro del gesto del usuario deja el canal abierto.
    const silencio = new SpeechSynthesisUtterance('');
    silencio.volume = 0;
    this.sintesis.speak(silencio);
  }

  cantar(texto: string): void {
    if (this.#silenciado || this.#volumen === 0) return;

    // Si llega un número mientras habla, manda el nuevo: el tablero ya cambió.
    this.callar();

    const enunciado = new SpeechSynthesisUtterance(texto);
    enunciado.volume = this.#volumen;
    enunciado.lang = this.#voz?.lang ?? 'es-CL';
    if (this.#voz) enunciado.voice = this.#voz;
    // Un poco más lento que el habla normal: se entiende mejor un número suelto.
    enunciado.rate = 0.95;

    this.sintesis.speak(enunciado);
  }

  callar(): void {
    this.sintesis.cancel();
  }

  configurar({ volumen, silenciado }: { volumen: number; silenciado: boolean }): void {
    this.#volumen = Math.min(1, Math.max(0, volumen));
    this.#silenciado = silenciado;
    if (silenciado) this.callar();
  }
}

/** Devuelve el locutor del navegador, o el mudo si no hay síntesis de voz. */
export function crearAnnouncer(): Announcer {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return announcerMudo;

  try {
    return new WebSpeechAnnouncer(window.speechSynthesis);
  } catch {
    return announcerMudo;
  }
}
