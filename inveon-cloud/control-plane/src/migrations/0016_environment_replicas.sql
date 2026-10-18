CREATE TABLE IF NOT EXISTS "environment_replicas" (
	"environment_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"blue_port" integer NOT NULL,
	"green_port" integer NOT NULL,
	"listen_port" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"active_slot" text,
	"current_release_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_replicas_environment_id_server_id_pk" PRIMARY KEY("environment_id","server_id"),
	CONSTRAINT "environment_replicas_server_id_blue_port_unique" UNIQUE("server_id","blue_port")
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "rollout" jsonb;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "proxy_server_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environment_replicas" ADD CONSTRAINT "environment_replicas_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environment_replicas" ADD CONSTRAINT "environment_replicas_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "environment_replicas_server_idx" ON "environment_replicas" USING btree ("server_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "environments" ADD CONSTRAINT "environments_proxy_server_id_servers_id_fk" FOREIGN KEY ("proxy_server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
