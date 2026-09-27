DO $$ BEGIN
 CREATE TYPE "public"."opportunity_kind" AS ENUM('job', 'internship', 'program');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."quiz_attempt_status" AS ENUM('in_progress', 'submitted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"status" "quiz_attempt_status" DEFAULT 'submitted' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"score_percent" integer,
	"passed" boolean,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_id" text NOT NULL,
	"explanation" text,
	"points" integer DEFAULT 1 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunity_courses" (
	"opportunity_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "opportunity_courses_opportunity_id_course_id_pk" PRIMARY KEY("opportunity_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "passing_score_percent" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "time_limit_minutes" integer;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "certificate_template_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "best_score_percent" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "kind" "opportunity_kind" DEFAULT 'job' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "stipend_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "location" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_quiz_attempts" ADD CONSTRAINT "lesson_quiz_attempts_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_quiz_attempts" ADD CONSTRAINT "lesson_quiz_attempts_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_quiz_questions" ADD CONSTRAINT "lesson_quiz_questions_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunity_courses" ADD CONSTRAINT "opportunity_courses_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunity_courses" ADD CONSTRAINT "opportunity_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
