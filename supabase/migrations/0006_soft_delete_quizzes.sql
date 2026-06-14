-- Soft delete for quizzes: a 30-day grace period before permanent removal, so an
-- accidental delete never destroys captured leads (leads cascade-delete with the
-- quiz). deleted_at null = active; set = in the trash. A daily cron hard-deletes
-- rows whose deleted_at is older than 30 days. A soft-deleted quiz is treated as
-- offline everywhere public: the player and lead capture both filter deleted_at.
alter table quizzes add column if not exists deleted_at timestamptz;
create index if not exists quizzes_deleted_at_idx on quizzes (deleted_at);
