DO $$ BEGIN
 CREATE TYPE "public"."assignment_submission_status" AS ENUM('submitted', 'changes_requested', 'approved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" "assignment_submission_status" DEFAULT 'submitted' NOT NULL,
	"repo_url" text,
	"link_url" text,
	"notes" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"marks" integer,
	"feedback" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_submissions_assignment_user_unique" UNIQUE("assignment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internship_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text NOT NULL,
	"description" text NOT NULL,
	"roadmap" jsonb NOT NULL,
	"course_id" uuid,
	"exam_lesson_id" uuid,
	"opportunity_id" uuid,
	"fee" numeric(10, 2) DEFAULT '4000' NOT NULL,
	"duration_months" integer DEFAULT 6 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internship_tracks_slug_unique" UNIQUE("slug"),
	CONSTRAINT "internship_tracks_opportunity_id_unique" UNIQUE("opportunity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participant_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "participant_offers_seq_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reference_no" text,
	"enrollment_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_score" integer NOT NULL,
	"fee" numeric(10, 2) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	CONSTRAINT "participant_offers_enrollment_id_unique" UNIQUE("enrollment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill" text NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"steps" jsonb NOT NULL,
	"deliverable" text DEFAULT 'repo' NOT NULL,
	"level" text DEFAULT 'basic' NOT NULL,
	"max_marks" integer DEFAULT 10 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "track_assignments_skill_title_unique" UNIQUE("skill","title")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_track_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."track_assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_enrollment_id_program_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."program_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_tracks" ADD CONSTRAINT "internship_tracks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_tracks" ADD CONSTRAINT "internship_tracks_exam_lesson_id_course_lessons_id_fk" FOREIGN KEY ("exam_lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_tracks" ADD CONSTRAINT "internship_tracks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participant_offers" ADD CONSTRAINT "participant_offers_enrollment_id_program_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."program_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participant_offers" ADD CONSTRAINT "participant_offers_track_id_internship_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."internship_tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participant_offers" ADD CONSTRAINT "participant_offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_status_idx" ON "assignment_submissions" USING btree ("status","submitted_at");