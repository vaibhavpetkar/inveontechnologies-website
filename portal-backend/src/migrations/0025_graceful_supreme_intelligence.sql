CREATE TABLE IF NOT EXISTS "digest_sends" (
	"user_id" uuid NOT NULL,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_sends_user_id_sent_on_pk" PRIMARY KEY("user_id","sent_on")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
