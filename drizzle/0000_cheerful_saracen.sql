CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_name_not_blank" CHECK (length(trim("clients"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"hourly_rate" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_not_blank" CHECK (length(trim("projects"."name")) > 0),
	CONSTRAINT "projects_hourly_rate_non_negative" CHECK ("projects"."hourly_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_not_blank" CHECK (length(trim("sessions"."token_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_not_blank" CHECK (length(trim("users"."email")) > 0),
	CONSTRAINT "users_first_name_not_blank" CHECK (length(trim("users"."first_name")) > 0),
	CONSTRAINT "users_last_name_not_blank" CHECK (length(trim("users"."last_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "work_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"description" text NOT NULL,
	"hourly_rate" numeric(12, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"is_billed" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_entries_duration_valid" CHECK ("work_entries"."duration_minutes" >= 15 AND "work_entries"."duration_minutes" % 15 = 0),
	CONSTRAINT "work_entries_description_not_blank" CHECK (length(trim("work_entries"."description")) > 0),
	CONSTRAINT "work_entries_hourly_rate_non_negative" CHECK ("work_entries"."hourly_rate" >= 0),
	CONSTRAINT "work_entries_amount_non_negative" CHECK ("work_entries"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_name_unique" ON "clients" USING btree ("user_id",lower(trim("name")));--> statement-breakpoint
CREATE INDEX "clients_user_active_idx" ON "clients" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_client_name_unique" ON "projects" USING btree ("client_id",lower(trim("name")));--> statement-breakpoint
CREATE INDEX "projects_client_active_idx" ON "projects" USING btree ("client_id","is_active");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower(trim("email")));--> statement-breakpoint
CREATE INDEX "work_entries_user_date_idx" ON "work_entries" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "work_entries_project_date_idx" ON "work_entries" USING btree ("project_id","work_date");--> statement-breakpoint
CREATE INDEX "work_entries_user_deleted_date_idx" ON "work_entries" USING btree ("user_id","is_deleted","work_date");