ALTER TABLE "conversation_participants" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "private_conversations" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "private_conversations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "private_conversations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_conversations" ADD CONSTRAINT "private_conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
