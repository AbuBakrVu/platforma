CREATE TYPE "public"."duel_status" AS ENUM('pending', 'active', 'done', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('new', 'issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_mode" AS ENUM('full', 'mistakes', 'score');--> statement-breakpoint
CREATE TYPE "public"."shop_kind" AS ENUM('merch', 'perk', 'freeze', 'frame');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('submitted', 'accepted', 'returned');--> statement-breakpoint
ALTER TYPE "public"."step_kind" ADD VALUE 'assignment';--> statement-breakpoint
CREATE TABLE "activity_days" (
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "activity_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_coins" integer DEFAULT 0 NOT NULL,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"status" "duel_status" DEFAULT 'pending' NOT NULL,
	"questions" jsonb NOT NULL,
	"challenger_answers" jsonb,
	"opponent_answers" jsonb,
	"challenger_score" integer,
	"opponent_score" integer,
	"challenger_ms" integer,
	"opponent_ms" integer,
	"challenger_started_at" timestamp with time zone,
	"opponent_started_at" timestamp with time zone,
	"winner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_results" (
	"week" text NOT NULL,
	"user_id" uuid NOT NULL,
	"league" integer NOT NULL,
	"place" integer NOT NULL,
	"xp" integer NOT NULL,
	"move" integer NOT NULL,
	CONSTRAINT "league_results_week_user_id_pk" PRIMARY KEY("week","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_weeks" (
	"week" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"kind" "shop_kind" DEFAULT 'merch' NOT NULL,
	"value" text,
	"stock" integer,
	"image_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"max_score" integer,
	"feedback" text DEFAULT '' NOT NULL,
	"reviewer_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "team_members_user_id_pk" PRIMARY KEY("user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#1E5A3C' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_code_pk" PRIMARY KEY("user_id","code")
);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "score_points" integer;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "max_points" integer;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD COLUMN "points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD COLUMN "explanation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "shuffle_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "review" "review_mode" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "access" text DEFAULT 'course' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_color" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "frame" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_goal" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "freezes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "league" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_events" ADD CONSTRAINT "coin_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_challenger_id_users_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_results" ADD CONSTRAINT "league_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_step_id_lesson_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lesson_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coin_user_idx" ON "coin_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_source_idx" ON "coin_events" USING btree ("user_id","source_key");--> statement-breakpoint
CREATE INDEX "duels_challenger_idx" ON "duels" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "duels_opponent_idx" ON "duels" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "purchases_status_idx" ON "purchases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_step_user_idx" ON "submissions" USING btree ("step_id","user_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");