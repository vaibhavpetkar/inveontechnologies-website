ALTER TABLE "assignment_submissions" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "check_report" jsonb;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "auto_checked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "track_assignments" ADD COLUMN "kind" text DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "track_assignments" ADD COLUMN "exercise" jsonb;