ALTER TABLE "offers" ADD COLUMN "employee_type" "employee_type";--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "joining_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;