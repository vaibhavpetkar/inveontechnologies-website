DO $$ BEGIN
 CREATE TYPE "public"."payment_order_status" AS ENUM('created', 'paid', 'failed', 'dropped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."program_enrollment_status" AS ENUM('awaiting_choice', 'trial', 'trial_expired', 'paid', 'waived', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_order_status" DEFAULT 'created' NOT NULL,
	"payment_session_id" text,
	"gateway_payment_id" text,
	"last_event" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "program_enrollment_status" DEFAULT 'awaiting_choice' NOT NULL,
	"amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"trial_hours" integer DEFAULT 24 NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_note" text,
	"joining_details" jsonb,
	"joining_submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_enrollments_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "program_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "trial_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_enrollment_id_program_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."program_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_enrollment_idx" ON "payment_orders" USING btree ("enrollment_id");