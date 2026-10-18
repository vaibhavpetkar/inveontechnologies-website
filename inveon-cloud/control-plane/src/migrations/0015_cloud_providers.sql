CREATE TABLE IF NOT EXISTS "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token_enc" text NOT NULL,
	"token_hint" text NOT NULL,
	"account_label" text,
	"verified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_org_id_provider_unique" UNIQUE("org_id","provider")
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "private_ip_address" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_region" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_instance_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_size" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_image" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_state" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "resize_target" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
