CREATE TABLE IF NOT EXISTS "lesson_code_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level" text DEFAULT 'basic' NOT NULL,
	"spec" jsonb NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lesson_code_questions_lesson_key_unique" UNIQUE("lesson_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_code_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text,
	"code" text NOT NULL,
	"report" jsonb NOT NULL,
	"status" text NOT NULL,
	"emailed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "catalog_key" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "catalog_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_code_questions" ADD CONSTRAINT "lesson_code_questions_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_code_submissions" ADD CONSTRAINT "lesson_code_submissions_question_id_lesson_code_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."lesson_code_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_code_submissions" ADD CONSTRAINT "lesson_code_submissions_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_code_submissions" ADD CONSTRAINT "lesson_code_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_code_submissions_question_idx" ON "lesson_code_submissions" USING btree ("question_id","enrollment_id","submitted_at");--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_catalog_key_unique" UNIQUE("catalog_key");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_catalog_key_unique" UNIQUE("catalog_key");