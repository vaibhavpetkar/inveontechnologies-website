CREATE TABLE IF NOT EXISTS "archived_releases" (
	"environment_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"job_id" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archived_releases_environment_id_release_id_pk" PRIMARY KEY("environment_id","release_id")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "keep_releases" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archived_releases" ADD CONSTRAINT "archived_releases_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archived_releases" ADD CONSTRAINT "archived_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
