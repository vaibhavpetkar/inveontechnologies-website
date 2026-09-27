DO $$ BEGIN
 CREATE TYPE "public"."attendee_response" AS ENUM('needs_action', 'accepted', 'declined', 'tentative');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."meeting_provider" AS ENUM('none', 'manual', 'google_meet', 'zoom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_event_attendees" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "attendee_response" DEFAULT 'needs_action' NOT NULL,
	"reminded_at" timestamp with time zone,
	CONSTRAINT "calendar_event_attendees_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"meeting_provider" "meeting_provider" DEFAULT 'none' NOT NULL,
	"join_url" text,
	"external_id" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_attendees_user_idx" ON "calendar_event_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_starts_at_idx" ON "calendar_events" USING btree ("starts_at");