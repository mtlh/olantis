ALTER TABLE "holding_snapshots" ADD COLUMN "origin" text DEFAULT 'recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "history_backfilled_at" integer;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "history_backfill_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "history_backfill_error" text;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "origin" text DEFAULT 'recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "origin" text DEFAULT 'recorded' NOT NULL;