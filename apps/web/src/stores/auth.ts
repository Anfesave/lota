import type { CurrentUser, LoginInput, RegisterInput } from '@lota/shared';
import { create } from 'zustand';
import { api, ApiError, postJson } from '../lib/api.js';

type EstadoSesion = 'cargando' | 'listo';

interface AuthState {
  user: CurrentUser | null;
  /** 'cargando' hasta que sabemos si hay sesion; evita parpadeos al login. */
  estado: EstadoSesion;
  cargarSesion: () => Promise<void>;
  entrar: (datos: LoginInput) => Promise<void>;
  registrarse: (datos: RegisterInput) => Promise<void>;
  salir: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  estado: 'cargando',

  async cargarSesion() {
    try {
      set({ user: await api<CurrentUser>('/me'), estado: 'listo' });
    } catch (error) {
      // Un 401 aqui es lo normal: simplemente no hay sesion iniciada.
      if (error instanceof ApiError && error.status === 401) {
        set({ user: null, estado: 'listo' });
        return;
      }
      set({ user: null, estado: 'listo' });
      throw error;
    }
  },

  async entrar(datos) {
    set({ user: await postJson<CurrentUser>('/auth/login', datos), estado: 'listo' });
  },

  async registrarse(datos) {
    set({ user: await postJson<CurrentUser>('/auth/register', datos), estado: 'listo' });
  },

  async salir() {
    try {
      await postJson<{ ok: boolean }>('/auth/logout', {});
    } finally {
      // Aunque falle la llamada, en el cliente ya no hay sesion.
      set({ user: null, estado: 'listo' });
    }
  },

  setUser(user) {
    set({ user, estado: 'listo' });
  },
}));
