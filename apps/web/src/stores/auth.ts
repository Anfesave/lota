import type { CurrentUser, LoginInput, RegisterInput } from '@lota/shared';
import { create } from 'zustand';
import { t } from '../i18n/es-CL.js';
import { api, ApiError, postJson } from '../lib/api.js';

type EstadoSesion = 'cargando' | 'listo';

interface AuthState {
  user: CurrentUser | null;
  /** 'cargando' hasta que sabemos si hay sesion; evita parpadeos al login. */
  estado: EstadoSesion;
  /**
   * Fallo al consultar la sesion que **no** es un 401. Sirve para distinguir
   * "no has entrado" de "el servidor no contesta": con el plan Free de Render
   * el servicio se apaga tras 15 min y el primer intento puede fallar. Mandar
   * a login en ese caso seria mentirle al usuario.
   */
  errorSesion: string | null;
  cargarSesion: () => Promise<void>;
  entrar: (datos: LoginInput) => Promise<void>;
  registrarse: (datos: RegisterInput) => Promise<void>;
  salir: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  estado: 'cargando',
  errorSesion: null,

  async cargarSesion() {
    try {
      set({ user: await api<CurrentUser>('/me'), estado: 'listo', errorSesion: null });
    } catch (error) {
      // Un 401 aqui es lo normal: simplemente no hay sesion iniciada.
      const sinSesion = error instanceof ApiError && error.status === 401;
      set({
        user: null,
        estado: 'listo',
        // Nunca se relanza: nadie espera esta promesa y acabaria como un
        // "unhandled rejection" en la consola del navegador.
        errorSesion: sinSesion
          ? null
          : error instanceof ApiError
            ? error.message
            : t.comun.errorGenerico,
      });
    }
  },

  async entrar(datos) {
    const user = await postJson<CurrentUser>('/auth/login', datos);
    set({ user, estado: 'listo', errorSesion: null });
  },

  async registrarse(datos) {
    const user = await postJson<CurrentUser>('/auth/register', datos);
    set({ user, estado: 'listo', errorSesion: null });
  },

  async salir() {
    try {
      await postJson<{ ok: boolean }>('/auth/logout', {});
    } finally {
      // Aunque falle la llamada, en el cliente ya no hay sesion.
      set({ user: null, estado: 'listo', errorSesion: null });
    }
  },

  setUser(user) {
    set({ user, estado: 'listo', errorSesion: null });
  },
}));
