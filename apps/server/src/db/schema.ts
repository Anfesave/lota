/**
 * Esquema de la base de datos (Drizzle ORM).
 *
 * Tras cambiar este archivo: `pnpm db:generate` y luego `pnpm db:migrate`.
 */
import { MAX_VICTORY_MESSAGE_LENGTH } from '@lota/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
    /** Saldo derivado: la fuente de verdad es coin_transactions. */
    coins: integer('coins').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('users_coins_no_negativos', sql`${table.coins} >= 0`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 del token, nunca el token en claro. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

// --- Fase 6: economia y cosmeticos ----------------------------------------

export const cosmeticTypeEnum = pgEnum('cosmetic_type', [
  'CARTON_THEME',
  'MARKER',
  'AVATAR_FRAME',
  'VICTORY_EFFECT',
  'TITLE',
]);

export const rarityEnum = pgEnum('rarity', ['COMUN', 'RARO', 'EPICO', 'LEGENDARIO']);

export const coinReasonEnum = pgEnum('coin_reason', [
  'GAME_WIN',
  'LINE_WIN',
  /** Por terminar la partida sin ganarla. */
  'GAME_PLAYED',
  'PURCHASE',
  'DAILY_BONUS',
  'ADMIN',
]);

export const gameResultEnum = pgEnum('game_result', ['WIN_FULL', 'WIN_LINE', 'NONE']);

export const cosmetics = pgTable('cosmetics', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  type: cosmeticTypeEnum('type').notNull(),
  price: integer('price').notNull(),
  rarity: rarityEnum('rarity').notNull(),
  /** Colores, clases CSS, id de animacion... depende del tipo. */
  data: jsonb('data').notNull().default({}),
  active: boolean('active').notNull().default(true),
});

export const userCosmetics = pgTable(
  'user_cosmetics',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cosmeticId: uuid('cosmetic_id')
      .notNull()
      .references(() => cosmetics.id, { onDelete: 'cascade' }),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cosmeticId] })],
);

export const userEquipped = pgTable(
  'user_equipped',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: cosmeticTypeEnum('type').notNull(),
    cosmeticId: uuid('cosmetic_id')
      .notNull()
      .references(() => cosmetics.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
);

/** Libro contable de monedas; `users.coins` es el saldo derivado. */
export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Positivo = ganado, negativo = gastado. */
    amount: integer('amount').notNull(),
    reason: coinReasonEnum('reason').notNull(),
    /** game_id o cosmetic_id, segun el motivo. */
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // El tope diario y el bono consultan por usuario y fecha.
    index('coin_transactions_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/** Historial de partidas terminadas. Las salas activas viven en memoria. */
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id').references(() => users.id, { onDelete: 'set null' }),
  settings: jsonb('settings').notNull(),
  drawnNumbers: integer('drawn_numbers').array().notNull(),
  /** Suma de las apuestas anotadas; es un registro, no dinero movido. */
  pot: integer('pot').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cards: jsonb('cards').notNull(),
    result: gameResultEnum('result').notNull(),
    coinsWon: integer('coins_won').notNull().default(0),
    bet: integer('bet').notNull().default(0),
    potWon: integer('pot_won').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.userId] }),
    index('game_players_user_idx').on(table.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type CosmeticRow = typeof cosmetics.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type GamePlayerRow = typeof gamePlayers.$inferSelect;
