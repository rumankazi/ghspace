CREATE TABLE "github_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token" "bytea" NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token" "bytea",
	"refresh_token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_request_involvement" (
	"user_id" uuid NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"is_author" boolean DEFAULT false NOT NULL,
	"is_review_requested" boolean DEFAULT false NOT NULL,
	"is_assigned" boolean DEFAULT false NOT NULL,
	"is_mentioned" boolean DEFAULT false NOT NULL,
	"has_reviewed" boolean DEFAULT false NOT NULL,
	"bucket" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_request_involvement_user_id_pull_request_id_pk" PRIMARY KEY("user_id","pull_request_id")
);
--> statement-breakpoint
CREATE TABLE "pull_request_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"requested_login" text NOT NULL,
	"is_team" boolean DEFAULT false NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "pull_request_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" text NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"reviewer_login" text,
	"reviewer_avatar_url" text,
	"state" text NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"author_login" text,
	"author_avatar_url" text,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changed_files" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"review_decision" text,
	"mergeable" text,
	"checks_state" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"name_with_owner" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"url" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_synced" integer DEFAULT 0 NOT NULL,
	"error" text,
	"rate_limit_cost" integer,
	"rate_limit_remaining" integer,
	"rate_limit_reset_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_user_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"api_base_url" text DEFAULT 'https://api.github.com' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_credentials" ADD CONSTRAINT "github_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_involvement" ADD CONSTRAINT "pull_request_involvement_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_involvement" ADD CONSTRAINT "pull_request_involvement_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_review_requests" ADD CONSTRAINT "pull_request_review_requests_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_involvement_user_bucket_idx" ON "pull_request_involvement" USING btree ("user_id","bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_review_requests_key" ON "pull_request_review_requests" USING btree ("pull_request_id","requested_login");--> statement-breakpoint
CREATE INDEX "pr_review_requests_pr_idx" ON "pull_request_review_requests" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_request_reviews_node_id_key" ON "pull_request_reviews" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "pull_request_reviews_pr_idx" ON "pull_request_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_node_id_key" ON "pull_requests" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "pull_requests_repository_idx" ON "pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pull_requests_updated_at_idx" ON "pull_requests" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_node_id_key" ON "repositories" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "repositories_name_with_owner_idx" ON "repositories" USING btree ("name_with_owner");--> statement-breakpoint
CREATE INDEX "sync_runs_user_started_idx" ON "sync_runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_user_id_key" ON "users" USING btree ("github_user_id");