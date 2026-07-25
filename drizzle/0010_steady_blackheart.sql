ALTER TABLE "projects" ADD COLUMN "hour_bank_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hour_bank_start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hour_bank_initial_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "max_daily_billable_minutes" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "max_weekly_billable_minutes" integer DEFAULT 2400 NOT NULL;--> statement-breakpoint

-- Chaque projet existant hérite d'abord de la configuration de son client.
UPDATE "projects" AS project
SET
  "hour_bank_enabled" = client."hour_bank_enabled",
  "hour_bank_start_date" = client."hour_bank_start_date",
  "hour_bank_initial_minutes" = client."hour_bank_initial_minutes",
  "max_daily_billable_minutes" = client."max_daily_billable_minutes",
  "max_weekly_billable_minutes" = client."max_weekly_billable_minutes"
FROM "clients" AS client
WHERE client."id" = project."client_id";--> statement-breakpoint

ALTER TABLE "hour_bank_closures" ADD COLUMN "project_id" uuid;--> statement-breakpoint

-- Une ancienne fermeture client est associée au projet ayant reçu le plus
-- d'heures durant la semaine; le premier projet sert de repli sans entrée.
UPDATE "hour_bank_closures" AS closure
SET "project_id" = COALESCE(
  (
    SELECT entry."project_id"
    FROM "work_entries" AS entry
    INNER JOIN "projects" AS project ON project."id" = entry."project_id"
    WHERE project."client_id" = closure."client_id"
      AND entry."work_date" BETWEEN closure."week_start" AND closure."week_end"
      AND entry."is_deleted" = false
    GROUP BY entry."project_id"
    ORDER BY SUM(entry."duration_minutes") DESC, entry."project_id"
    LIMIT 1
  ),
  (
    SELECT project."id"
    FROM "projects" AS project
    WHERE project."client_id" = closure."client_id"
    ORDER BY project."created_at", project."id"
    LIMIT 1
  )
);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "hour_bank_closures" WHERE "project_id" IS NULL) THEN
    RAISE EXCEPTION 'Unable to associate every hour-bank closure with a project';
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "hour_bank_closures" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hour_bank_closures" ADD CONSTRAINT "hour_bank_closures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hour_bank_closures_project_week_unique" ON "hour_bank_closures" USING btree ("project_id","week_start");--> statement-breakpoint
CREATE INDEX "hour_bank_closures_user_project_idx" ON "hour_bank_closures" USING btree ("user_id","project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_daily_billable_positive" CHECK ("projects"."max_daily_billable_minutes" > 0);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_weekly_billable_positive" CHECK ("projects"."max_weekly_billable_minutes" > 0);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_hour_bank_start_required" CHECK (not "projects"."hour_bank_enabled" or "projects"."hour_bank_start_date" is not null);--> statement-breakpoint

ALTER TABLE "clients" DROP CONSTRAINT "clients_daily_billable_positive";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_weekly_billable_positive";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_hour_bank_start_required";--> statement-breakpoint
ALTER TABLE "hour_bank_closures" DROP CONSTRAINT "hour_bank_closures_client_id_clients_id_fk";--> statement-breakpoint
DROP INDEX "hour_bank_closures_client_week_unique";--> statement-breakpoint
DROP INDEX "hour_bank_closures_user_client_idx";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "hour_bank_enabled";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "hour_bank_start_date";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "hour_bank_initial_minutes";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "max_daily_billable_minutes";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "max_weekly_billable_minutes";--> statement-breakpoint
ALTER TABLE "hour_bank_closures" DROP COLUMN "client_id";
