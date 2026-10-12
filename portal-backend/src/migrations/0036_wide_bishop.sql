DO $$ BEGIN
 CREATE TYPE "public"."sprint_status" AS ENUM('planned', 'active', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sprint_scope" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sprint_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"status" "sprint_status" DEFAULT 'planned' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"committed_points" integer,
	"completed_points" integer,
	"completed_issues" integer,
	"carried_over_issues" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "wip_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sprint_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "story_points" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "rank" double precision;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sprint_scope" ADD CONSTRAINT "sprint_scope_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sprint_scope" ADD CONSTRAINT "sprint_scope_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sprints" ADD CONSTRAINT "sprints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sprint_scope_sprint_idx" ON "sprint_scope" USING btree ("sprint_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sprints_one_active_per_project" ON "sprints" ("project_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_sprint_idx" ON "tasks" ("sprint_id");--> statement-breakpoint
UPDATE "tasks" t SET "rank" = r.n FROM (SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n FROM "tasks" WHERE project_id IS NOT NULL) r WHERE r.id = t.id;--> statement-breakpoint
CREATE OR REPLACE FUNCTION assign_task_rank() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.rank IS NULL THEN
    SELECT coalesce(max(rank), 0) + 1 INTO NEW.rank FROM tasks WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_assign_rank ON tasks;--> statement-breakpoint
CREATE TRIGGER tasks_assign_rank BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION assign_task_rank();
--> statement-breakpoint
INSERT INTO "sprint_scope" ("sprint_id", "task_id", "added_at") SELECT "sprint_id", "id", now() FROM "tasks" WHERE "sprint_id" IS NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION track_sprint_scope() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.sprint_id IS NOT DISTINCT FROM NEW.sprint_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sprint_id IS NOT NULL THEN
    UPDATE sprint_scope SET removed_at = now() WHERE task_id = NEW.id AND sprint_id = OLD.sprint_id AND removed_at IS NULL;
  END IF;
  IF NEW.sprint_id IS NOT NULL THEN
    INSERT INTO sprint_scope (sprint_id, task_id) VALUES (NEW.sprint_id, NEW.id);
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_track_sprint_scope ON tasks;--> statement-breakpoint
CREATE TRIGGER tasks_track_sprint_scope AFTER INSERT OR UPDATE OF sprint_id ON tasks FOR EACH ROW EXECUTE FUNCTION track_sprint_scope();
