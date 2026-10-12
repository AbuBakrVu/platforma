ALTER TYPE "public"."role" ADD VALUE 'parent';--> statement-breakpoint
CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"perms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_children" (
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_children_parent_id_child_id_pk" PRIMARY KEY("parent_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "user_courses" (
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"until" timestamp with time zone,
	CONSTRAINT "user_courses_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "parent_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "child_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "external" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "course_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "access_role_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "parent_skills" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonator_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_role_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_children" ADD CONSTRAINT "parent_children_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "parent_children_child_idx" ON "parent_children" USING btree ("child_id");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;