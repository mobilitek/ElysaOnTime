ALTER TABLE "work_entries" DROP CONSTRAINT "work_entries_hourly_rate_non_negative";--> statement-breakpoint
ALTER TABLE "work_entries" DROP CONSTRAINT "work_entries_amount_non_negative";--> statement-breakpoint
ALTER TABLE "work_entries" DROP CONSTRAINT "work_entries_duration_valid";--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_duration_valid" CHECK ("work_entries"."duration_minutes" >= 0);