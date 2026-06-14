-- Capture the lead's name alongside email + phone. Owners use it to personalise
-- follow-up (a name in the subject line and greeting lifts open and reply
-- rates). Nullable on purpose: existing leads predate this, and the server keeps
-- name optional so a missing name never costs a captured lead.
alter table leads add column if not exists name text;
