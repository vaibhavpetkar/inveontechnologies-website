CREATE TABLE IF NOT EXISTS "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"kind" text DEFAULT 'general' NOT NULL,
	"ref_id" text,
	"status" text NOT NULL,
	"error" text,
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_of_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"user_id" uuid NOT NULL,
	"score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stats" jsonb,
	"note" text,
	"chosen_by" uuid,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_of_month_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"current_due_date" timestamp with time zone,
	"requested_due_date" timestamp with time zone,
	"proposed_assignee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_documents" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "participant_offers" ADD COLUMN "fee_category" text;--> statement-breakpoint
ALTER TABLE "participant_offers" ADD COLUMN "work_mode" text DEFAULT 'Remote' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_offers" ADD COLUMN "joining_date" date;--> statement-breakpoint
ALTER TABLE "participant_offers" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "participant_offers" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rating_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rated_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_log" ADD CONSTRAINT "email_log_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_of_month" ADD CONSTRAINT "employee_of_month_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_of_month" ADD CONSTRAINT "employee_of_month_chosen_by_users_id_fk" FOREIGN KEY ("chosen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_proposed_assignee_id_users_id_fk" FOREIGN KEY ("proposed_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_created_idx" ON "email_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_log_to_idx" ON "email_log" USING btree ("to_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_requests_task_idx" ON "task_requests" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_requests_status_idx" ON "task_requests" USING btree ("status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_rated_by_users_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
