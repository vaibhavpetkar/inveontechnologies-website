CREATE TABLE IF NOT EXISTS "company_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_policies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "seq_number" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "employee_letters_seq_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "reference_no" text;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "policies" jsonb;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "emailed_to" text;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN "accepted_name" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
