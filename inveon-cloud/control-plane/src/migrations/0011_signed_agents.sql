CREATE TABLE IF NOT EXISTS "agent_request_nonces" (
	"server_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_request_nonces_server_id_nonce_pk" PRIMARY KEY("server_id","nonce")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "require_signed_agents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "signing_public_key" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "signing_key_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_request_nonces" ADD CONSTRAINT "agent_request_nonces_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_request_nonces_expires_idx" ON "agent_request_nonces" USING btree ("expires_at");