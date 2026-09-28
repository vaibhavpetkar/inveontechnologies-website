ALTER TABLE "assessment_attempts" DROP CONSTRAINT "assessment_attempts_application_id_unique";--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;