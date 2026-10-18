CREATE TABLE IF NOT EXISTS "user_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"alg" integer NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"aaguid" text,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"backup_eligible" boolean DEFAULT false NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_passkeys_user_idx" ON "user_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webauthn_challenges_expires_idx" ON "webauthn_challenges" USING btree ("expires_at");