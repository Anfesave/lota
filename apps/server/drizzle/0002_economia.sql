CREATE TYPE "public"."coin_reason" AS ENUM('GAME_WIN', 'LINE_WIN', 'PURCHASE', 'DAILY_BONUS', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_type" AS ENUM('CARTON_THEME', 'MARKER', 'AVATAR_FRAME', 'VICTORY_EFFECT', 'TITLE');--> statement-breakpoint
CREATE TYPE "public"."game_result" AS ENUM('WIN_FULL', 'WIN_LINE', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('COMUN', 'RARO', 'EPICO', 'LEGENDARIO');--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" "coin_reason" NOT NULL,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cosmetics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "cosmetic_type" NOT NULL,
	"price" integer NOT NULL,
	"rarity" "rarity" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cosmetics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cards" jsonb NOT NULL,
	"result" "game_result" NOT NULL,
	"coins_won" integer DEFAULT 0 NOT NULL,
	"bet" integer DEFAULT 0 NOT NULL,
	"pot_won" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_players_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid,
	"settings" jsonb NOT NULL,
	"drawn_numbers" integer[] NOT NULL,
	"pot" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cosmetics" (
	"user_id" uuid NOT NULL,
	"cosmetic_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_cosmetics_user_id_cosmetic_id_pk" PRIMARY KEY("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "user_equipped" (
	"user_id" uuid NOT NULL,
	"type" "cosmetic_type" NOT NULL,
	"cosmetic_id" uuid NOT NULL,
	CONSTRAINT "user_equipped_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipped" ADD CONSTRAINT "user_equipped_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipped" ADD CONSTRAINT "user_equipped_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coin_transactions_user_created_idx" ON "coin_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "game_players_user_idx" ON "game_players" USING btree ("user_id");