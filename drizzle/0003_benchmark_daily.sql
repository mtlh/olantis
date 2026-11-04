CREATE TABLE IF NOT EXISTS "benchmark_daily" (
	"symbol" text NOT NULL,
	"date" text NOT NULL,
	"price" numeric NOT NULL,
	"currency" text,
	"updated_at" integer NOT NULL,
	CONSTRAINT "benchmark_daily_symbol_date_pk" PRIMARY KEY("symbol","date")
);
