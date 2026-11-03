CREATE TABLE IF NOT EXISTS "quote_daily" (
	"symbol" text NOT NULL,
	"date" text NOT NULL,
	"price" numeric NOT NULL,
	"currency" text,
	"updated_at" integer NOT NULL,
	CONSTRAINT "quote_daily_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolios_user_id_idx" ON "portfolios" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolios_account_id_idx" ON "portfolios" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolios_provider_id_idx" ON "portfolios" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "providers_user_id_idx" ON "providers" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "providers_account_id_idx" ON "providers" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_user_id_idx" ON "holdings" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_portfolio_id_idx" ON "holdings" USING btree ("portfolio_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_provider_id_idx" ON "holdings" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_account_id_idx" ON "holdings" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_portfolio_id_idx" ON "transactions" USING btree ("portfolio_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_holding_id_idx" ON "transactions" USING btree ("holding_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_id_idx" ON "goals" USING btree ("user_id");