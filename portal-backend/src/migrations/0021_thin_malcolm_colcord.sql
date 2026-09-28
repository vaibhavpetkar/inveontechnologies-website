ALTER TABLE "calendar_events" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "series_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_course_idx" ON "calendar_events" USING btree ("course_id","starts_at");