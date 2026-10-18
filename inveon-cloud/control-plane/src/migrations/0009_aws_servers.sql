CREATE TABLE IF NOT EXISTS "aws_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"auth_type" text,
	"role_arn" text,
	"external_id" text NOT NULL,
	"access_key_id" text,
	"secret_access_key_enc" text,
	"default_region" text DEFAULT 'ap-south-1' NOT NULL,
	"account_id" text,
	"verified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aws_connections_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "provision_state" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "provision_error" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_region" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_instance_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_instance_type" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_ami_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_state" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_security_group_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "aws_created_security_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "terminated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aws_connections" ADD CONSTRAINT "aws_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aws_connections" ADD CONSTRAINT "aws_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
