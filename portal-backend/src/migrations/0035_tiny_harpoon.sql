DO $$ BEGIN
 CREATE TYPE "public"."issue_type" AS ENUM('epic', 'story', 'task', 'bug');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_task_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_watchers" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_watchers_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_issue_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN "mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "field" text;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "from_value" text;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "to_value" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "type" "issue_type" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "labels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_task_filters" ADD CONSTRAINT "saved_task_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Existing projects get a key: the initials of a multi-word title ("Inveon Portal" -> "IP"),
-- or the first three letters of a one-word title ("Website" -> "WEB"); repeats get a digit.
WITH words AS (
  SELECT id, created_at, array_remove(regexp_split_to_array(upper(regexp_replace(title, '[^A-Za-z0-9]+', ' ', 'g')), ' '), '') AS w FROM "projects"
), base AS (
  SELECT id, created_at, CASE
      WHEN coalesce(array_length(w, 1), 0) = 0 THEN 'PRJ'
      WHEN array_length(w, 1) = 1 THEN CASE WHEN length(w[1]) < 2 THEN w[1] || 'P' ELSE left(w[1], 3) END
      ELSE left((SELECT string_agg(left(x, 1), '') FROM unnest(w) AS x), 4)
    END AS k
  FROM words
), keyed AS (
  SELECT id, k, row_number() OVER (PARTITION BY k ORDER BY created_at, id) AS n FROM base
)
UPDATE "projects" p SET "key" = CASE WHEN keyed.n = 1 THEN keyed.k ELSE keyed.k || keyed.n END
  FROM keyed WHERE keyed.id = p.id;--> statement-breakpoint
-- Should a generated key still clash (e.g. "IP" twice next to an "IP2"), add part of the id.
WITH dup AS (SELECT id, row_number() OVER (PARTITION BY "key" ORDER BY created_at, id) AS n FROM "projects")
UPDATE "projects" p SET "key" = left(p."key", 4) || upper(left(replace(p.id::text, '-', ''), 4)) FROM dup WHERE dup.id = p.id AND dup.n > 1;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
-- Number existing project tasks in the order they were created.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n FROM "tasks" WHERE project_id IS NOT NULL
)
UPDATE "tasks" t SET "number" = numbered.n FROM numbered WHERE numbered.id = t.id;--> statement-breakpoint
UPDATE "projects" p SET "next_issue_number" = coalesce((SELECT max("number") FROM "tasks" t WHERE t.project_id = p.id), 0) + 1;--> statement-breakpoint
-- Creators and assignees follow their existing tasks.
INSERT INTO "task_watchers" ("task_id", "user_id")
  SELECT id, created_by FROM "tasks" UNION SELECT id, assignee_id FROM "tasks" WHERE assignee_id IS NOT NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_key_unique" UNIQUE("key");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_number_unique" UNIQUE("project_id","number");--> statement-breakpoint
-- Every new project task takes the project's next number, whichever code path inserts it.
CREATE OR REPLACE FUNCTION assign_task_number() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.number IS NULL THEN
    UPDATE projects SET next_issue_number = next_issue_number + 1 WHERE id = NEW.project_id RETURNING next_issue_number - 1 INTO NEW.number;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_assign_number ON tasks;--> statement-breakpoint
CREATE TRIGGER tasks_assign_number BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION assign_task_number();
