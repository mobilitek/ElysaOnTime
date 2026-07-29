CREATE TABLE "technical_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid,
	"level" varchar(20) NOT NULL,
	"method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" numeric(12, 2) NOT NULL,
	"error_code" varchar(100),
	"error_name" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_logs_level_valid" CHECK ("technical_logs"."level" in ('info', 'warning', 'error'))
);
--> statement-breakpoint
ALTER TABLE "technical_logs" ADD CONSTRAINT "technical_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "technical_logs_created_idx" ON "technical_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "technical_logs_level_created_idx" ON "technical_logs" USING btree ("level","created_at");--> statement-breakpoint
CREATE INDEX "technical_logs_status_created_idx" ON "technical_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "technical_logs_request_idx" ON "technical_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "technical_logs_user_created_idx" ON "technical_logs" USING btree ("user_id","created_at");