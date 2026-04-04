-- AI usage tracking for the blog editor AI assist feature.
-- Logs each AI request (action, user, input size) for admin visibility.

CREATE TABLE IF NOT EXISTS blog_ai_usage (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now()             NOT NULL,
  user_id     text                                  NOT NULL,
  action      text                                  NOT NULL,
  input_chars integer                               NOT NULL
);

CREATE INDEX IF NOT EXISTS blog_ai_usage_created_at_idx ON blog_ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS blog_ai_usage_user_id_idx    ON blog_ai_usage (user_id);
CREATE INDEX IF NOT EXISTS blog_ai_usage_action_idx     ON blog_ai_usage (action);
