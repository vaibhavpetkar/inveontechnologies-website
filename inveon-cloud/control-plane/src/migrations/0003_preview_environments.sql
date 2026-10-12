ALTER TABLE "apps" ADD COLUMN "previews_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "preview_server_id" uuid;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "preview_base_domain" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "preview_vars_from_environment_id" uuid;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "preview_pr" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "apps" ADD CONSTRAINT "apps_preview_server_id_servers_id_fk" FOREIGN KEY ("preview_server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
