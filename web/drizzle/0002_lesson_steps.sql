CREATE TYPE "public"."lesson_layout" AS ENUM('steps', 'longread');--> statement-breakpoint
CREATE TYPE "public"."package_kind" AS ENUM('scorm12', 'scorm2004', 'xapi', 'cmi5');--> statement-breakpoint
CREATE TYPE "public"."step_kind" AS ENUM('text', 'video', 'file', 'quiz', 'cards', 'package');--> statement-breakpoint
CREATE TABLE "card_reviews" (
	"user_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"ease_x100" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_reviews_user_id_step_id_card_id_pk" PRIMARY KEY("user_id","step_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "step_kind" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_state" (
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"token" text NOT NULL,
	"registration" uuid DEFAULT gen_random_uuid() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"score_percent" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_state_user_id_package_id_pk" PRIMARY KEY("user_id","package_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"kind" "package_kind" NOT NULL,
	"title" text NOT NULL,
	"launch" text NOT NULL,
	"activity_id" text,
	"launch_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_progress" (
	"user_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_progress_user_id_step_id_pk" PRIMARY KEY("user_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"pdf_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xapi_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"verb" text NOT NULL,
	"statement" jsonb NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "layout" "lesson_layout" DEFAULT 'steps' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_step_id_lesson_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lesson_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_steps" ADD CONSTRAINT "lesson_steps_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_state" ADD CONSTRAINT "package_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_state" ADD CONSTRAINT "package_state_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_progress" ADD CONSTRAINT "step_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_progress" ADD CONSTRAINT "step_progress_step_id_lesson_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lesson_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xapi_statements" ADD CONSTRAINT "xapi_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xapi_statements" ADD CONSTRAINT "xapi_statements_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_reviews_due_idx" ON "card_reviews" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "lesson_steps_idx" ON "lesson_steps" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "package_state_token_idx" ON "package_state" USING btree ("token");--> statement-breakpoint
CREATE INDEX "xapi_user_pkg_idx" ON "xapi_statements" USING btree ("user_id","package_id");--> statement-breakpoint
-- Текст существующих уроков становится их первым шагом
INSERT INTO "lesson_steps" ("lesson_id", "position", "kind", "title", "content")
SELECT "id", 1, 'text', '', jsonb_build_object('md', "body") FROM "lessons" WHERE "body" <> '';
