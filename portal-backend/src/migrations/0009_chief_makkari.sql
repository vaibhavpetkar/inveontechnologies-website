DO $$ BEGIN
 CREATE TYPE "public"."course_payment_status" AS ENUM('not_required', 'pending', 'paid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD COLUMN "payment_status" "course_payment_status" DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD COLUMN "marked_paid_by" uuid;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD COLUMN "marked_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "price_amount" numeric(10, 2);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_marked_paid_by_users_id_fk" FOREIGN KEY ("marked_paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
