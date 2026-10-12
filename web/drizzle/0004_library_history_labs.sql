ALTER TYPE "public"."step_kind" ADD VALUE 'lab';--> statement-breakpoint
CREATE TABLE "course_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid,
	"upload_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"error" text,
	"tasks_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "step_kind" NOT NULL,
	"title" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid,
	"library_id" uuid,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_steps" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "course_log" ADD CONSTRAINT "course_log_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_log" ADD CONSTRAINT "course_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_step_id_lesson_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lesson_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_revisions" ADD CONSTRAINT "step_revisions_step_id_lesson_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lesson_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_revisions" ADD CONSTRAINT "step_revisions_library_id_library_items_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_revisions" ADD CONSTRAINT "step_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_log_idx" ON "course_log" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "course_materials_idx" ON "course_materials" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "lab_sessions_user_idx" ON "lab_sessions" USING btree ("user_id","step_id");--> statement-breakpoint
CREATE INDEX "step_revisions_step_idx" ON "step_revisions" USING btree ("step_id","created_at");--> statement-breakpoint
CREATE INDEX "step_revisions_lib_idx" ON "step_revisions" USING btree ("library_id","created_at");--> statement-breakpoint
ALTER TABLE "lesson_steps" ADD CONSTRAINT "lesson_steps_library_id_library_items_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_steps_library_idx" ON "lesson_steps" USING btree ("library_id");