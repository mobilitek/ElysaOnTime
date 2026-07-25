ALTER TABLE "users" ADD COLUMN "account_status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_started_on" date DEFAULT current_date NOT NULL;--> statement-breakpoint
UPDATE "users" SET "subscription_started_on" = "created_at"::date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_ends_on" date;--> statement-breakpoint
CREATE INDEX "users_account_status_idx" ON "users" USING btree ("account_status");--> statement-breakpoint
CREATE INDEX "users_subscription_ends_idx" ON "users" USING btree ("subscription_ends_on");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_valid" CHECK ("users"."account_status" in ('active', 'suspended', 'disabled'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_dates_valid" CHECK ("users"."subscription_ends_on" is null or "users"."subscription_ends_on" >= "users"."subscription_started_on");
