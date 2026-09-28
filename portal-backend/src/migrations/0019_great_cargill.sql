ALTER TABLE "projects" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_state" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_username" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_github_issue_unique" UNIQUE("github_repo","github_issue_number");