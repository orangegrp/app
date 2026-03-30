-- Deny-by-default: new users get empty permissions; mini-apps require explicit CSV grants.
-- Run manually on existing deployments when ready.

ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '';

-- Optional (strict): strip legacy `app.home` — users lose mini-app access until admins assign CSV.
-- UPDATE users SET permissions = '' WHERE trim(permissions) = 'app.home';

-- Optional (continuity): map legacy `app.home` to all current mini-app permissions instead of stripping.
-- UPDATE users SET permissions = 'app.blog,app.content,app.music,app.room,app.labs,app.webpc'
-- WHERE trim(permissions) = 'app.home';
