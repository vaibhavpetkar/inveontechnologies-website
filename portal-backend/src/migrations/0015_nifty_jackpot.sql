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
CREATE TABLE IF NOT EXISTS "opportunity_courses" (
	"opportunity_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "opportunity_courses_opportunity_id_course_id_pk" PRIMARY KEY("opportunity_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ALTER COLUMN "score_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ALTER COLUMN "passed" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ALTER COLUMN "submitted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "time_limit_minutes" integer;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ADD COLUMN "status" "quiz_attempt_status" DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_quiz_attempts" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "kind" "opportunity_kind" DEFAULT 'job' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "stipend_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "location" text;--> statement-breakpoint
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
