ALTER TYPE "course_payment_status" ADD VALUE 'overdue';--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD COLUMN "payment_due_at" timestamp with time zone;