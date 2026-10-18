CREATE TABLE IF NOT EXISTS "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url_enc" text,
	"url_hint" text,
	"signing_secret_enc" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_status" integer,
	"last_error" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_channel_id_alert_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."alert_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_channels_org_idx" ON "alert_channels" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_deliveries_due_idx" ON "alert_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_deliveries_org_created_idx" ON "alert_deliveries" USING btree ("org_id","created_at");