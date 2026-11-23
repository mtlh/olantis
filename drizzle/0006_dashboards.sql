CREATE TABLE "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"widgets" jsonb NOT NULL,
	"sort_order" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dashboards_user_id_idx" ON "dashboards" USING btree ("user_id");