CREATE TABLE "course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_requests_status_idx" ON "course_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "course_requests_user_idx" ON "course_requests" USING btree ("user_id");--> statement-breakpoint
-- Потоков больше нет: доступ к курсам — запись ученика на курс (user_courses). Сохраняем то, что ученики видели через поток.
INSERT INTO "user_courses" ("user_id", "course_id")
  SELECT u."id", gc."course_id" FROM "users" u JOIN "group_courses" gc ON gc."group_id" = u."group_id" WHERE u."role" = 'student'
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_courses" ("user_id", "course_id")
  SELECT u."id", pc."course_id" FROM "users" u
    JOIN "group_programs" gp ON gp."group_id" = u."group_id"
    JOIN "program_courses" pc ON pc."program_id" = gp."program_id"
  WHERE u."role" = 'student'
  ON CONFLICT DO NOTHING;
