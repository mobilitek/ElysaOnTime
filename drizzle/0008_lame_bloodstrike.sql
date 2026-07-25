CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_started_on" date NOT NULL,
	"period_ends_on" date NOT NULL,
	"payment_date" date,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'paid' NOT NULL,
	"payment_provider" varchar(50),
	"external_reference" varchar(200),
	"note" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_period_valid" CHECK ("user_subscriptions"."period_ends_on" >= "user_subscriptions"."period_started_on"),
	CONSTRAINT "user_subscriptions_amount_non_negative" CHECK ("user_subscriptions"."amount" >= 0),
	CONSTRAINT "user_subscriptions_payment_status_valid" CHECK ("user_subscriptions"."payment_status" in ('pending', 'paid', 'failed', 'refunded', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_subscriptions_user_period_idx" ON "user_subscriptions" USING btree ("user_id","period_started_on");--> statement-breakpoint
CREATE INDEX "user_subscriptions_payment_date_idx" ON "user_subscriptions" USING btree ("payment_date");