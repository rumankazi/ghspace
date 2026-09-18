CREATE TABLE "pull_request_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "user_repository_access" (
	"user_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_repository_access_user_id_repository_id_pk" PRIMARY KEY("user_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "installation_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "installation_id" uuid;--> statement-breakpoint
ALTER TABLE "pull_request_assignees" ADD CONSTRAINT "pull_request_assignees_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_repository_access" ADD CONSTRAINT "user_repository_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_repository_access" ADD CONSTRAINT "user_repository_access_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_assignees_key" ON "pull_request_assignees" USING btree ("pull_request_id","login");--> statement-breakpoint
CREATE INDEX "pr_assignees_pr_idx" ON "pull_request_assignees" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "user_repository_access_user_idx" ON "user_repository_access" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repositories_installation_idx" ON "repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "sync_runs_installation_started_idx" ON "sync_runs" USING btree ("installation_id","started_at" DESC NULLS LAST);