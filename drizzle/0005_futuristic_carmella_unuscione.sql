ALTER TABLE "work_entries" ADD COLUMN "client_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "work_entries" SET "client_minutes" = "duration_minutes";--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_client_minutes_valid" CHECK ("work_entries"."client_minutes" >= 0);
