CREATE INDEX "certificates_user_idx" ON "certificates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exam_attempts_exam_idx" ON "exam_attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_lesson_idx" ON "lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "step_progress_step_idx" ON "step_progress" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "submissions_user_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "uploads_pdf_idx" ON "uploads" USING btree ("pdf_id");--> statement-breakpoint
CREATE INDEX "uploads_course_idx" ON "uploads" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "user_courses_course_idx" ON "user_courses" USING btree ("course_id");