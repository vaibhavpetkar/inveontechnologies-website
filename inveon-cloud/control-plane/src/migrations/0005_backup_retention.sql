ALTER TABLE "backup_configs" ADD COLUMN "keep_daily" integer;--> statement-breakpoint
ALTER TABLE "backup_configs" ADD COLUMN "keep_weekly" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_configs" ADD COLUMN "last_pruned_at" timestamp with time zone;