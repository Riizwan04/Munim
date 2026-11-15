-- 0008: every business names its own voice assistant (e.g. "Jarvis", "Munshi", "Babu"). Empty = not named yet.
alter table businesses add column if not exists assistant_name text not null default '';
