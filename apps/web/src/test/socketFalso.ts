type Manejador = (...args: unknown[]) => void;

export interface EmitidoPorCliente {
  evento: string;
  payload: unknown;
}

/**
 * Socket de mentira que sustituye a socket.io-client en los tests. Deja
 * disparar eventos como si vinieran del servidor y ver qué mandó el cliente,
 * sin abrir ninguna conexión.
 */
class SocketFalso {
  connected = false;
  readonly emitidos: EmitidoPorCliente[] = [];
  /** Respuesta del acuse de recibo por evento; por defecto `{ ok: true }`. */
  readonly respuestas = new Map<string, unknown>();

  readonly #manejadores = new Map<string, Manejador[]>();

  on(evento: string, manejador: Manejador): this {
    const lista = this.#manejadores.get(evento) ?? [];
    lista.push(manejador);
    this.#manejadores.set(evento, lista);
    return this;
  }

  off(evento: string): this {
    this.#manejadores.delete(evento);
    return this;
  }

  emit(evento: string, ...args: unknown[]): this {
    const acuse = args.at(-1);
    const payload = args.length > 1 ? args[0] : undefined;
    this.emitidos.push({ evento, payload });

    if (typeof acuse === 'function') {
      const respuesta = this.respuestas.get(evento) ?? { ok: true, data: undefined };
      (acuse as Manejador)(respuesta);
    }
    return this;
  }

  connect(): this {
    this.connected = true;
    this.servidorEmite('connect');
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  removeAllListeners(): this {
    this.#manejadores.clear();
    return this;
  }

  /** Dispara un evento como si lo hubiera mandado el servidor. */
  servidorEmite(evento: string, payload?: unknown): void {
    for (const manejador of this.#manejadores.get(evento) ?? []) manejador(payload);
  }

  limpiar(): void {
    this.connected = false;
    this.emitidos.length = 0;
    this.respuestas.clear();
    this.#manejadores.clear();
  }
}

/** Instancia única: `io()` siempre devuelve esta, así el test la controla. */
export const socketFalso = new SocketFalso();
