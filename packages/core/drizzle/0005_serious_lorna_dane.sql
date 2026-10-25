CREATE TABLE "repository_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_workflow_id" bigint NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"run_id" bigint,
	"run_number" integer,
	"run_attempt" integer,
	"status" text,
	"conclusion" text,
	"event" text,
	"branch" text,
	"head_sha" text,
	"head_commit_message" text,
	"actor_login" text,
	"actor_avatar_url" text,
	"run_url" text,
	"run_started_at" timestamp with time zone,
	"run_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "default_branch" text;--> statement-breakpoint
ALTER TABLE "repository_workflows" ADD CONSTRAINT "repository_workflows_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_workflows_key" ON "repository_workflows" USING btree ("repository_id","github_workflow_id");--> statement-breakpoint
CREATE INDEX "repository_workflows_repository_idx" ON "repository_workflows" USING btree ("repository_id");