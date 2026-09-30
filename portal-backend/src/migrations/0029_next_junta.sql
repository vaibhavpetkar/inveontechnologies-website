ALTER TABLE "document_requests" ALTER COLUMN "requested_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "document_type" text;