-- Liens temporaires de partage lecture seule (contenu conversation uniquement, pas de RAG)

CREATE TABLE public.conversation_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_id UUID REFERENCES public.hosts(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'Conversation',
  messages JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_shares_messages_array CHECK (jsonb_typeof(messages) = 'array')
);

CREATE INDEX conversation_shares_token_idx ON public.conversation_shares(token);
CREATE INDEX conversation_shares_expires_idx ON public.conversation_shares(expires_at);
CREATE INDEX conversation_shares_user_id_idx ON public.conversation_shares(user_id);

ALTER TABLE public.conversation_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_shares_insert ON public.conversation_shares
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY conversation_shares_select_own ON public.conversation_shares
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY conversation_shares_delete_own ON public.conversation_shares
  FOR DELETE USING (user_id = auth.uid());
