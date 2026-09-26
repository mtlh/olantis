CREATE TABLE IF NOT EXISTS "fx_rates" (
	"currency" text NOT NULL,
	"date" text NOT NULL,
	"rate_to_gbp" numeric NOT NULL,
	CONSTRAINT "fx_rates_currency_date_pk" PRIMARY KEY("currency", "date")
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "sector" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"exchange" text,
	"currency" text,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_user_symbol_unique" ON "watchlist_items" USING btree ("user_id", "symbol");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_value" numeric NOT NULL,
	"target_date" text NOT NULL,
	"created_at" integer NOT NULL
);
