CREATE TABLE "hour_bank_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"actual_minutes" integer NOT NULL,
	"billed_minutes" integer NOT NULL,
	"movement_minutes" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hour_bank_closures_actual_non_negative" CHECK ("hour_bank_closures"."actual_minutes" >= 0),
	CONSTRAINT "hour_bank_closures_billed_non_negative" CHECK ("hour_bank_closures"."billed_minutes" >= 0),
	CONSTRAINT "hour_bank_closures_movement_consistent" CHECK ("hour_bank_closures"."movement_minutes" = "hour_bank_closures"."actual_minutes" - "hour_bank_closures"."billed_minutes")
);
--> statement-breakpoint
CREATE TABLE "hour_bank_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closure_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"actual_minutes" integer NOT NULL,
	"billed_minutes" integer NOT NULL,
	"movement_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hour_bank_days_actual_non_negative" CHECK ("hour_bank_days"."actual_minutes" >= 0),
	CONSTRAINT "hour_bank_days_billed_non_negative" CHECK ("hour_bank_days"."billed_minutes" >= 0),
	CONSTRAINT "hour_bank_days_movement_consistent" CHECK ("hour_bank_days"."movement_minutes" = "hour_bank_days"."actual_minutes" - "hour_bank_days"."billed_minutes")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "hour_bank_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "hour_bank_start_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "hour_bank_initial_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "max_daily_billable_minutes" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "max_weekly_billable_minutes" integer DEFAULT 2400 NOT NULL;--> statement-breakpoint
ALTER TABLE "hour_bank_closures" ADD CONSTRAINT "hour_bank_closures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_bank_closures" ADD CONSTRAINT "hour_bank_closures_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_bank_days" ADD CONSTRAINT "hour_bank_days_closure_id_hour_bank_closures_id_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."hour_bank_closures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hour_bank_closures_client_week_unique" ON "hour_bank_closures" USING btree ("client_id","week_start");--> statement-breakpoint
CREATE INDEX "hour_bank_closures_user_client_idx" ON "hour_bank_closures" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hour_bank_days_closure_date_unique" ON "hour_bank_days" USING btree ("closure_id","work_date");--> statement-breakpoint
CREATE INDEX "hour_bank_days_date_idx" ON "hour_bank_days" USING btree ("work_date");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_daily_billable_positive" CHECK ("clients"."max_daily_billable_minutes" > 0);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_weekly_billable_positive" CHECK ("clients"."max_weekly_billable_minutes" > 0);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_hour_bank_start_required" CHECK (not "clients"."hour_bank_enabled" or "clients"."hour_bank_start_date" is not null);