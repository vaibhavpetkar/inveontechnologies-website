CREATE TABLE IF NOT EXISTS "metric_alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"server_id" uuid,
	"metric" text NOT NULL,
	"threshold_pct" integer,
	"for_minutes" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"rule_id" uuid,
	"threshold_pct" integer,
	"for_minutes" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"open_value" double precision,
	"peak_value" double precision,
	"clear_value" double precision,
	"closed_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "server_metric_rollups" (
	"server_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"samples" integer NOT NULL,
	"cpu_pct" double precision,
	"cpu_pct_max" double precision,
	"load1" double precision,
	"load5" double precision,
	"load15" double precision,
	"mem_used_bytes" bigint,
	"mem_used_bytes_max" bigint,
	"mem_total_bytes" bigint,
	"disk_root_used_bytes" bigint,
	"disk_root_total_bytes" bigint,
	"disk_docker_used_bytes" bigint,
	"disk_docker_total_bytes" bigint,
	"net_rx_bps" double precision,
	"net_tx_bps" double precision,
	"containers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "server_metric_rollups_server_id_bucket_pk" PRIMARY KEY("server_id","bucket")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "server_metrics" (
	"server_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"cpu_pct" double precision,
	"load1" double precision,
	"load5" double precision,
	"load15" double precision,
	"mem_used_bytes" bigint,
	"mem_total_bytes" bigint,
	"disk_root_used_bytes" bigint,
	"disk_root_total_bytes" bigint,
	"disk_docker_used_bytes" bigint,
	"disk_docker_total_bytes" bigint,
	"net_rx_bps" double precision,
	"net_tx_bps" double precision,
	"containers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "server_metrics_server_id_at_pk" PRIMARY KEY("server_id","at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_alert_rules" ADD CONSTRAINT "metric_alert_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_alert_rules" ADD CONSTRAINT "metric_alert_rules_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_alert_rules" ADD CONSTRAINT "metric_alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_incidents" ADD CONSTRAINT "metric_incidents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_incidents" ADD CONSTRAINT "metric_incidents_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_incidents" ADD CONSTRAINT "metric_incidents_rule_id_metric_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."metric_alert_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_tokens" ADD CONSTRAINT "scrape_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_tokens" ADD CONSTRAINT "scrape_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_metric_rollups" ADD CONSTRAINT "server_metric_rollups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_metrics" ADD CONSTRAINT "server_metrics_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_alert_rules_org_default_idx" ON "metric_alert_rules" USING btree ("org_id","metric") WHERE server_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_alert_rules_server_idx" ON "metric_alert_rules" USING btree ("server_id","metric") WHERE server_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_incidents_open_idx" ON "metric_incidents" USING btree ("server_id","metric") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_incidents_server_started_idx" ON "metric_incidents" USING btree ("server_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scrape_tokens_org_idx" ON "scrape_tokens" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_metric_rollups_bucket_idx" ON "server_metric_rollups" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_metrics_at_idx" ON "server_metrics" USING btree ("at");