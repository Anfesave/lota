/**
 * Esquema de la base de datos (Drizzle ORM).
 *
 * Fase 1: users, sessions.
 * Fase 6: cosmetics, user_cosmetics, user_equipped, coin_transactions, games, game_players.
 *
 * Tras cambiar este archivo: `pnpm db:generate` y luego `pnpm db:migrate`.
 */
import { MAX_VICTORY_MESSAGE_LENGTH } from '@lota/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * `citext` compara sin distinguir mayusculas, asi "DonPepe" y "donpepe" son el
 * mismo usuario. Requiere la extension, que crea la migracion 0001.
 */
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: citext('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    victoryMessage: varchar('victory_message', { length: MAX_VICTORY_MESSAGE_LENGTH }).notNull(),
    /** Saldo derivado: la fuente de verdad sera coin_transactions (Fase 6). */
    coins: integer('coins').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('users_coins_no_negativos', sql`${table.coins} >= 0`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 del token, nunca el token en claro: una fuga de BD no da sesiones. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    // Para que la limpieza periodica de sesiones vencidas no recorra la tabla.
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
