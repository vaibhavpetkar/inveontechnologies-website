CREATE TABLE IF NOT EXISTS "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text,
	"suspended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_pr_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"comment_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_pr_comments_app_id_pr_number_unique" UNIQUE("app_id","pr_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_pr_comments" ADD CONSTRAINT "github_pr_comments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_installations_org_idx" ON "github_installations" USING btree ("org_id");