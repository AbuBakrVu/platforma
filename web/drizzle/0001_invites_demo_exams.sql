CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"role" "role" DEFAULT 'student' NOT NULL,
	"group_id" uuid,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "xp" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_code_idx" ON "invites" USING btree ("code");--> statement-breakpoint
-- Помечаем демо-данные, загруженные сидом до появления флага demo
UPDATE "users" SET "demo" = true WHERE "email" LIKE '%@platforma.local' AND "role" <> 'admin';--> statement-breakpoint
UPDATE "groups" SET "demo" = true WHERE "name" = 'DevOps-24' AND EXISTS (SELECT 1 FROM "users" u WHERE u."group_id" = "groups"."id" AND u."email" = 'demo@platforma.local');--> statement-breakpoint
UPDATE "courses" SET "demo" = true WHERE "slug" IN ('kubernetes', 'docker') AND EXISTS (SELECT 1 FROM "group_courses" gc JOIN "groups" g ON g."id" = gc."group_id" WHERE gc."course_id" = "courses"."id" AND g."demo");
