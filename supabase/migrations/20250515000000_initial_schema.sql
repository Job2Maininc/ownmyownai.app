-- OwnMyOwnAI V1 schema

CREATE TYPE public.host_status AS ENUM ('offline', 'online', 'busy');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Mon PC',
  platform TEXT NOT NULL DEFAULT 'windows',
  ollama_version TEXT,
  default_model TEXT NOT NULL DEFAULT 'llama3.2:3b',
  status public.host_status NOT NULL DEFAULT 'offline',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hosts_user_id_idx ON public.hosts(user_id);

CREATE TABLE public.host_credentials (
  host_id UUID PRIMARY KEY REFERENCES public.hosts(id) ON DELETE CASCADE,
  device_secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pairing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  host_id UUID REFERENCES public.hosts(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pairing_requests_user_id_idx ON public.pairing_requests(user_id);
CREATE INDEX pairing_requests_code_idx ON public.pairing_requests(code);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY hosts_select ON public.hosts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY hosts_insert ON public.hosts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY hosts_update ON public.hosts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY hosts_delete ON public.hosts
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY pairing_select ON public.pairing_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY pairing_insert ON public.pairing_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- host_credentials: no client access (Edge Functions use service role)
