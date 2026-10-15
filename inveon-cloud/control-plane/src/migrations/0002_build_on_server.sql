ALTER TABLE "apps" ADD COLUMN "build_on_server" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "dockerfile_path" text DEFAULT 'Dockerfile' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "build_context" text DEFAULT '.' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "registry_server" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "registry_username" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "registry_password_enc" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "deploy_key_enc" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "deploy_key_public" text;