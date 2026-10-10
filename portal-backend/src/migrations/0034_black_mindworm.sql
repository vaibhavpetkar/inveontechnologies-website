ALTER TABLE "document_requests" ALTER COLUMN "application_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "document_requests" d SET "user_id" = a."user_id" FROM "applications" a WHERE a."id" = d."application_id";--> statement-breakpoint
ALTER TABLE "document_requests" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
