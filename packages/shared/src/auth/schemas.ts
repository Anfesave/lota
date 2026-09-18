import { z } from 'zod';
import {
  MAX_VICTORY_MESSAGE_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../constants.js';
import { containsBannedWord } from '../words.js';

/** Solo letras, numeros y guion bajo: evita suplantaciones con espacios raros. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `El nombre debe tener al menos ${USERNAME_MIN_LENGTH} caracteres.`)
  .max(USERNAME_MAX_LENGTH, `El nombre no puede pasar de ${USERNAME_MAX_LENGTH} caracteres.`)
  .regex(USERNAME_PATTERN, 'Solo se permiten letras, numeros y guion bajo.')
  .refine((valor) => !containsBannedWord(valor), 'Ese nombre no esta permitido.');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  // El limite de 72 viene de argon2/bcrypt: mas alla los bytes se ignorarian.
  .max(PASSWORD_MAX_LENGTH, `La contrasena no puede pasar de ${PASSWORD_MAX_LENGTH} caracteres.`);

export const victoryMessageSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un mensaje de victoria.')
  .max(MAX_VICTORY_MESSAGE_LENGTH, `Maximo ${MAX_VICTORY_MESSAGE_LENGTH} caracteres.`)
  .refine((valor) => !containsBannedWord(valor), 'Ese mensaje no esta permitido.');

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  victoryMessage: victoryMessageSchema,
});

/** En login no revalidamos formato: un usuario antiguo no debe quedar fuera. */
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const updateMeSchema = z.object({
  victoryMessage: victoryMessageSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** Lo que devuelve GET /api/me. `equipped` se llena en la Fase 6. */
export interface CurrentUser {
  id: string;
  username: string;
  victoryMessage: string;
  coins: number;
  createdAt: string;
  equipped: Record<string, string>;
}
