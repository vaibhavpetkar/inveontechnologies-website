ALTER TABLE "deployments" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "release_output" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "backup_id" uuid;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "release_command" text;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "release_service" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_backup_id_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."backups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
