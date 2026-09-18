/** Error de la API con el codigo que devuelve el servidor. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

/**
 * Cliente HTTP de la API. `credentials: 'include'` es lo que hace viajar la
 * cookie de sesion; sin eso el servidor nos veria siempre como anonimos.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    // Render apaga el servicio tras 15 min sin trafico: el primer intento
    // puede morir mientras arranca.
    throw new ApiError(0, 'SIN_CONEXION', 'No se pudo contactar al servidor.');
  }

  if (res.status === 204) return undefined as T;

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (cuerpo ?? {}) as ErrorBody;
    throw new ApiError(
      res.status,
      typeof error.code === 'string' ? error.code : 'ERROR',
      typeof error.message === 'string' ? error.message : 'Algo salio mal.',
    );
  }

  return cuerpo as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
