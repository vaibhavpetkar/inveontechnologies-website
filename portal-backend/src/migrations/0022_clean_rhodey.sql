DO $$ BEGIN
 CREATE TYPE "public"."attendance_status" AS ENUM('present', 'half_day', 'absent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."leave_type" AS ENUM('casual', 'sick', 'earned', 'unpaid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."work_mode" AS ENUM('office', 'remote');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"work_mode" "work_mode",
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"note" text,
	"marked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_employee_date_unique" UNIQUE("employee_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_policies" (
	"employee_type" "employee_type" NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"days_per_year" numeric(4, 1) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_policies_employee_type_leave_type_pk" PRIMARY KEY("employee_type","leave_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"days" numeric(4, 1) NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id","start_date");--> statement-breakpoint
INSERT INTO "leave_policies" ("employee_type", "leave_type", "days_per_year") VALUES
  ('full_time', 'casual', 12), ('full_time', 'sick', 6), ('full_time', 'earned', 15),
  ('contract', 'casual', 12), ('contract', 'sick', 6), ('contract', 'earned', 0),
  ('intern', 'casual', 6), ('intern', 'sick', 3), ('intern', 'earned', 0)
ON CONFLICT DO NOTHING;
