-- Mail webhook event coverage extensions
-- Adds outbound lifecycle columns + normalized per-message event timeline.

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (
      delivery_status IN (
        'pending',
        'scheduled',
        'sent',
        'delivered',
        'delivery_delayed',
        'failed',
        'bounced',
        'suppressed'
      )
    );

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS last_delivery_event_at TIMESTAMPTZ;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS last_delivery_event_type TEXT;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS mail_messages_delivery_status_idx
  ON mail_messages (delivery_status);

CREATE INDEX IF NOT EXISTS mail_messages_last_delivery_event_at_idx
  ON mail_messages (last_delivery_event_at DESC);

CREATE INDEX IF NOT EXISTS mail_webhook_events_event_type_idx
  ON mail_webhook_events (event_type);

CREATE TABLE IF NOT EXISTS mail_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  resend_message_id TEXT,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient TEXT,
  url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_event_id UUID REFERENCES mail_webhook_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_message_events_owner_user_id_idx
  ON mail_message_events (owner_user_id);

CREATE INDEX IF NOT EXISTS mail_message_events_message_id_idx
  ON mail_message_events (message_id);

CREATE INDEX IF NOT EXISTS mail_message_events_event_type_idx
  ON mail_message_events (event_type);

CREATE INDEX IF NOT EXISTS mail_message_events_event_at_idx
  ON mail_message_events (event_at DESC);

CREATE INDEX IF NOT EXISTS mail_message_events_resend_message_id_idx
  ON mail_message_events (resend_message_id);

ALTER TABLE mail_message_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mail_message_events'
      AND policyname = 'mail_message_events_owner_select'
  ) THEN
    CREATE POLICY mail_message_events_owner_select ON mail_message_events
      FOR SELECT USING (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mail_message_events'
      AND policyname = 'mail_message_events_owner_insert'
  ) THEN
    CREATE POLICY mail_message_events_owner_insert ON mail_message_events
      FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mail_message_events'
      AND policyname = 'mail_message_events_owner_update'
  ) THEN
    CREATE POLICY mail_message_events_owner_update ON mail_message_events
      FOR UPDATE USING (owner_user_id = public.current_request_user_id())
      WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mail_message_events'
      AND policyname = 'mail_message_events_owner_delete'
  ) THEN
    CREATE POLICY mail_message_events_owner_delete ON mail_message_events
      FOR DELETE USING (owner_user_id = public.current_request_user_id());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.mail_increment_open_count(message_id_in UUID, increment_by INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE mail_messages
  SET open_count = GREATEST(0, open_count + GREATEST(1, increment_by)),
      updated_at = now()
  WHERE id = message_id_in;
$$;

CREATE OR REPLACE FUNCTION public.mail_increment_click_count(message_id_in UUID, increment_by INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE mail_messages
  SET click_count = GREATEST(0, click_count + GREATEST(1, increment_by)),
      updated_at = now()
  WHERE id = message_id_in;
$$;

REVOKE ALL ON FUNCTION public.mail_increment_open_count(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mail_increment_click_count(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mail_increment_open_count(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mail_increment_click_count(UUID, INTEGER) TO authenticated, service_role;
