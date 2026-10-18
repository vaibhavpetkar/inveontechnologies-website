ALTER TABLE "environments" ADD COLUMN "maintenance_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "queued_release_id" uuid;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "queued_at" timestamp with time zone;