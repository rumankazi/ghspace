CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_avatar_url" text,
	"repository_selection" text DEFAULT 'selected' NOT NULL,
	"html_url" text,
	"suspended_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_installations" (
	"user_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"repository_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_installations_user_id_installation_id_pk" PRIMARY KEY("user_id","installation_id")
);
--> statement-breakpoint
ALTER TABLE "user_installations" ADD CONSTRAINT "user_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_installations" ADD CONSTRAINT "user_installations_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "installations_github_id_key" ON "installations" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "user_installations_user_idx" ON "user_installations" USING btree ("user_id");