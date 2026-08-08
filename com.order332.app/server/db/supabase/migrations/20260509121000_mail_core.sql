-- Mail mini-app core schema (security-first)
-- - Private mailbox data per app user
-- - Explicit RLS on every table
-- - Private storage bucket + path-scoped policies

CREATE OR REPLACE FUNCTION public.current_request_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('request.jwt.claim.sub', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN current_setting('request.jwt.claim.sub', true)::uuid
    ELSE NULL
  END
$$;

CREATE TABLE IF NOT EXISTS mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_email TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, primary_email)
);

CREATE INDEX IF NOT EXISTS mailboxes_owner_user_id_idx ON mailboxes(owner_user_id);
CREATE INDEX IF NOT EXISTS mailboxes_primary_email_idx ON mailboxes(primary_email);

CREATE TABLE IF NOT EXISTS mail_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(alias_email),
  UNIQUE(mailbox_id, alias_email)
);

CREATE INDEX IF NOT EXISTS mail_aliases_mailbox_id_idx ON mail_aliases(mailbox_id);
CREATE INDEX IF NOT EXISTS mail_aliases_owner_user_id_idx ON mail_aliases(owner_user_id);

CREATE TABLE IF NOT EXISTS mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent')),
  resend_message_id TEXT,
  resend_inbound_message_id TEXT,
  thread_ref TEXT,
  subject TEXT NOT NULL DEFAULT '',
  from_address TEXT NOT NULL,
  to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, resend_message_id),
  UNIQUE(owner_user_id, resend_inbound_message_id)
);

CREATE INDEX IF NOT EXISTS mail_messages_owner_folder_created_idx
  ON mail_messages(owner_user_id, folder, created_at DESC);
CREATE INDEX IF NOT EXISTS mail_messages_owner_read_created_idx
  ON mail_messages(owner_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS mail_messages_mailbox_id_idx ON mail_messages(mailbox_id);
CREATE INDEX IF NOT EXISTS mail_messages_thread_ref_idx ON mail_messages(thread_ref);

CREATE TABLE IF NOT EXISTS mail_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  content_id TEXT,
  is_inline BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_attachments_owner_user_id_idx ON mail_attachments(owner_user_id);
CREATE INDEX IF NOT EXISTS mail_attachments_message_id_idx ON mail_attachments(message_id);

CREATE TABLE IF NOT EXISTS mail_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  payload_sha256 TEXT,
  UNIQUE(provider, event_id)
);

ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_select'
  ) THEN
    CREATE POLICY mailboxes_owner_select ON mailboxes
      FOR SELECT USING (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_insert'
  ) THEN
    CREATE POLICY mailboxes_owner_insert ON mailboxes
      FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_update'
  ) THEN
    CREATE POLICY mailboxes_owner_update ON mailboxes
      FOR UPDATE USING (owner_user_id = public.current_request_user_id())
      WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_delete'
  ) THEN
    CREATE POLICY mailboxes_owner_delete ON mailboxes
      FOR DELETE USING (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_select'
  ) THEN
    CREATE POLICY mail_aliases_owner_select ON mail_aliases
      FOR SELECT USING (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_insert'
  ) THEN
    CREATE POLICY mail_aliases_owner_insert ON mail_aliases
      FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_update'
  ) THEN
    CREATE POLICY mail_aliases_owner_update ON mail_aliases
      FOR UPDATE USING (owner_user_id = public.current_request_user_id())
      WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_delete'
  ) THEN
    CREATE POLICY mail_aliases_owner_delete ON mail_aliases
      FOR DELETE USING (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_select'
  ) THEN
    CREATE POLICY mail_messages_owner_select ON mail_messages
      FOR SELECT USING (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_insert'
  ) THEN
    CREATE POLICY mail_messages_owner_insert ON mail_messages
      FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_update'
  ) THEN
    CREATE POLICY mail_messages_owner_update ON mail_messages
      FOR UPDATE USING (owner_user_id = public.current_request_user_id())
      WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_delete'
  ) THEN
    CREATE POLICY mail_messages_owner_delete ON mail_messages
      FOR DELETE USING (owner_user_id = public.current_request_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_select'
  ) THEN
    CREATE POLICY mail_attachments_owner_select ON mail_attachments
      FOR SELECT USING (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_insert'
  ) THEN
    CREATE POLICY mail_attachments_owner_insert ON mail_attachments
      FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_update'
  ) THEN
    CREATE POLICY mail_attachments_owner_update ON mail_attachments
      FOR UPDATE USING (owner_user_id = public.current_request_user_id())
      WITH CHECK (owner_user_id = public.current_request_user_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_delete'
  ) THEN
    CREATE POLICY mail_attachments_owner_delete ON mail_attachments
      FOR DELETE USING (owner_user_id = public.current_request_user_id());
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mail-attachments', 'mail-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'mail_attachments_owner_select'
  ) THEN
    CREATE POLICY mail_attachments_owner_select
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'mail-attachments'
        AND split_part(name, '/', 1) = public.current_request_user_id()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'mail_attachments_owner_insert'
  ) THEN
    CREATE POLICY mail_attachments_owner_insert
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'mail-attachments'
        AND split_part(name, '/', 1) = public.current_request_user_id()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'mail_attachments_owner_update'
  ) THEN
    CREATE POLICY mail_attachments_owner_update
      ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'mail-attachments'
        AND split_part(name, '/', 1) = public.current_request_user_id()::text
      )
      WITH CHECK (
        bucket_id = 'mail-attachments'
        AND split_part(name, '/', 1) = public.current_request_user_id()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'mail_attachments_owner_delete'
  ) THEN
    CREATE POLICY mail_attachments_owner_delete
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'mail-attachments'
        AND split_part(name, '/', 1) = public.current_request_user_id()::text
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication p
    WHERE p.pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables t
    WHERE t.pubname = 'supabase_realtime'
      AND t.schemaname = 'public'
      AND t.tablename = 'mail_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_messages;
  END IF;
END
$$;
