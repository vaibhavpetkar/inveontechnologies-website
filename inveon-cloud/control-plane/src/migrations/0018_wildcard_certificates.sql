CREATE TABLE IF NOT EXISTS "dns_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wildcard_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"record_name" text NOT NULL,
	"value" text NOT NULL,
	"provider_record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wildcard_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"base_domain" text NOT NULL,
	"dns_provider" text NOT NULL,
	"zone_id" text NOT NULL,
	"zone_name" text NOT NULL,
	"server_id" uuid NOT NULL,
	"status" text DEFAULT 'issuing' NOT NULL,
	"last_error" text,
	"cert_issued_at" timestamp with time zone,
	"cert_expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wildcard_certificates_server_id_base_domain_unique" UNIQUE("server_id","base_domain")
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "wildcard_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_challenges" ADD CONSTRAINT "dns_challenges_wildcard_id_wildcard_certificates_id_fk" FOREIGN KEY ("wildcard_id") REFERENCES "public"."wildcard_certificates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_challenges" ADD CONSTRAINT "dns_challenges_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wildcard_certificates" ADD CONSTRAINT "wildcard_certificates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wildcard_certificates" ADD CONSTRAINT "wildcard_certificates_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wildcard_certificates" ADD CONSTRAINT "wildcard_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dns_challenges_wildcard_idx" ON "dns_challenges" USING btree ("wildcard_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dns_challenges_job_idx" ON "dns_challenges" USING btree ("job_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_wildcard_id_wildcard_certificates_id_fk" FOREIGN KEY ("wildcard_id") REFERENCES "public"."wildcard_certificates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
