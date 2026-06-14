-- Owner brand color for the published quiz player (design-pass.md §2.4). Nullable;
-- null = the neutral ink default. The player applies it to progress, selected
-- answers, and buttons, with a contrast guard for button text. Logo upload is
-- deferred (needs storage + an abuse surface).
alter table quizzes add column if not exists theme_accent text;
