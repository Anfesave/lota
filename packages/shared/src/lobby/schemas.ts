import { z } from 'zod';
import {
  CALL_INTERVALS_MS,
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  LOBBY_NAME_MAX_LENGTH,
  LOBBY_NAME_MIN_LENGTH,
  LOBBY_PASSWORD_MAX_LENGTH,
  LOBBY_PASSWORD_MIN_LENGTH,
  MAX_CARDS_PER_PLAYER,
  MAX_CHAT_MESSAGE_LENGTH,
  MIN_CARDS_PER_PLAYER,
} from '../constants.js';
import { containsBannedWord } from '../words.js';
import type { LobbySettings } from './types.js';

export const lobbyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(LOBBY_CODE_LENGTH, `El código tiene ${LOBBY_CODE_LENGTH} caracteres.`)
  .regex(new RegExp(`^[${LOBBY_CODE_ALPHABET}]+$`), 'Ese código no es válido.');

export const lobbyNameSchema = z
  .string()
  .trim()
  .min(LOBBY_NAME_MIN_LENGTH, `El nombre debe tener al menos ${LOBBY_NAME_MIN_LENGTH} caracteres.`)
  .max(LOBBY_NAME_MAX_LENGTH, `El nombre no puede pasar de ${LOBBY_NAME_MAX_LENGTH} caracteres.`)
  .refine((valor) => !containsBannedWord(valor), 'Ese nombre no está permitido.');

export const lobbyPasswordSchema = z
  .string()
  .min(LOBBY_PASSWORD_MIN_LENGTH, `Mínimo ${LOBBY_PASSWORD_MIN_LENGTH} caracteres.`)
  .max(LOBBY_PASSWORD_MAX_LENGTH, `Máximo ${LOBBY_PASSWORD_MAX_LENGTH} caracteres.`);

export const cardsPerPlayerSchema = z
  .number()
  .int()
  .min(MIN_CARDS_PER_PLAYER)
  .max(MAX_CARDS_PER_PLAYER) as z.ZodType<LobbySettings['cardsPerPlayer']>;

export const callIntervalSchema = z.union([
  z.literal(CALL_INTERVALS_MS[0]),
  z.literal(CALL_INTERVALS_MS[1]),
  z.literal(CALL_INTERVALS_MS[2]),
  z.literal(CALL_INTERVALS_MS[3]),
]);

export const prizeModeSchema = z.enum(['CARTON_LLENO', 'LINEA_Y_CARTON']);
export const visibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

export const lobbySettingsSchema = z.object({
  cardsPerPlayer: cardsPerPlayerSchema,
  callIntervalMs: callIntervalSchema,
  prizeMode: prizeModeSchema,
  autoMark: z.boolean(),
});

/** Configuración con la que nace una sala. */
export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  cardsPerPlayer: 1,
  callIntervalMs: CALL_INTERVALS_MS[1],
  prizeMode: 'LINEA_Y_CARTON',
  autoMark: false,
};

export const createLobbySchema = z
  .object({
    name: lobbyNameSchema,
    visibility: visibilitySchema,
    password: lobbyPasswordSchema.optional(),
    settings: lobbySettingsSchema.partial().optional(),
  })
  // Una sala privada sin contraseña sería pública con un código más largo.
  .refine((datos) => datos.visibility === 'PUBLIC' || datos.password !== undefined, {
    message: 'Una sala privada necesita contraseña.',
    path: ['password'],
  });

export const joinLobbySchema = z.object({
  code: lobbyCodeSchema,
  password: z.string().max(LOBBY_PASSWORD_MAX_LENGTH).optional(),
});

export const readySchema = z.object({ ready: z.boolean() });

/** Solo el anfitrión, y solo en WAITING. Se valida en el servidor. */
export const updateSettingsSchema = lobbySettingsSchema
  .partial()
  .refine((datos) => Object.keys(datos).length > 0, 'No hay nada que cambiar.');

export const kickSchema = z.object({ userId: z.string().uuid() });

export const chatSendSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Escribe algo.')
    .max(MAX_CHAT_MESSAGE_LENGTH, `Máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`),
});

export type CreateLobbyInput = z.infer<typeof createLobbySchema>;
export type JoinLobbyInput = z.infer<typeof joinLobbySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ChatSendInput = z.infer<typeof chatSendSchema>;
