DROP POLICY IF EXISTS "Everyone can view settings" ON public.system_settings;
DROP POLICY IF EXISTS "Anyone authenticated can view settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users can view public settings" ON public.system_settings;
CREATE POLICY "Authenticated users can view public settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  key NOT IN ('resend_api_key','smtp_user','smtp_password','smtp_host','smtp_port','smtp_secure','whatsapp_api_key')
);
CREATE OR REPLACE FUNCTION public.check_duplicate_event(
  p_kota_id text,
  p_location text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p_kota_id IS NOT NULL
    AND p_location IS NOT NULL
    AND p_name IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.events AS e
      WHERE e.kabupaten_kota_id::text = p_kota_id
        AND e.location = p_location
        AND e.name = p_name
    );
$$;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.event_assignments;
DROP POLICY IF EXISTS "Admins can view all assignments" ON public.event_assignments;
CREATE POLICY "Admins can manage assignments"
ON public.event_assignments
FOR ALL
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.events AS scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
  OR public.has_role(auth.uid(), 'panitia'::public.app_role)
)
WITH CHECK (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.events AS scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
  OR public.has_role(auth.uid(), 'panitia'::public.app_role)
);
CREATE POLICY "Admins can view all assignments"
ON public.event_assignments
FOR SELECT
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.events AS scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
  OR event_assignments.referee_id = auth.uid()
);
ALTER TABLE public.event_assignments DROP CONSTRAINT IF EXISTS event_assignments_status_check;
ALTER TABLE public.event_assignments
ADD CONSTRAINT event_assignments_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text]));
CREATE OR REPLACE FUNCTION public.validate_event_assignment_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text := 'unauthorized';
  v_event_region uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: authenticated user required';
    END IF;
    IF NEW.status NOT IN ('pending', 'confirmed', 'declined', 'cancelled') THEN
      RAISE EXCEPTION 'INVALID_STATUS: %', NEW.status;
    END IF;
    SELECT kabupaten_kota_id INTO v_event_region FROM public.events WHERE id = NEW.event_id;
    IF public.is_admin_provinsi(v_actor) THEN
      v_actor_role := 'admin_provinsi';
    ELSIF public.has_role(v_actor, 'admin_kab_kota'::public.app_role)
      AND v_event_region IS NOT NULL
      AND v_event_region = public.get_user_kabupaten_kota(v_actor) THEN
      v_actor_role := 'admin_kab_kota';
    ELSIF NEW.referee_id = v_actor AND OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined') THEN
      v_actor_role := 'referee';
    END IF;
    IF v_actor_role = 'admin_provinsi' THEN
      IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
        OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', OLD.status, NEW.status;
    ELSIF v_actor_role = 'admin_kab_kota' THEN
      IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
        OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', OLD.status, NEW.status;
    ELSIF v_actor_role = 'referee' THEN
      IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;
    IF v_event_region IS NOT NULL THEN
      IF public.has_role(v_actor, 'admin_kab_kota'::public.app_role)
        AND v_event_region != public.get_user_kabupaten_kota(v_actor) THEN
        RAISE EXCEPTION 'CROSS_REGION_ACCESS';
      END IF;
    END IF;
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: % cannot mutate assignment status', v_actor;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_event_assignment_transition ON public.event_assignments;
CREATE TRIGGER validate_event_assignment_transition
BEFORE UPDATE ON public.event_assignments
FOR EACH ROW
EXECUTE FUNCTION public.validate_event_assignment_transition();
CREATE OR REPLACE FUNCTION public.transition_event_assignment_status(
  p_assignment_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL
)
RETURNS public.event_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_assignment public.event_assignments;
  v_old_status text;
  v_event_region uuid;
  v_actor_role text := 'unauthorized';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: authenticated user required';
  END IF;
  SELECT * INTO v_assignment FROM public.event_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_assignment.id IS NULL OR v_assignment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;
  v_old_status := v_assignment.status;
  IF p_target_status IS NULL OR p_target_status NOT IN ('pending', 'confirmed', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_target_status;
  END IF;
  SELECT kabupaten_kota_id INTO v_event_region FROM public.events WHERE id = v_assignment.event_id;
  IF public.is_admin_provinsi(v_actor) THEN
    v_actor_role := 'admin_provinsi';
  ELSIF public.has_role(v_actor, 'admin_kab_kota'::public.app_role)
    AND v_event_region IS NOT NULL
    AND v_event_region = public.get_user_kabupaten_kota(v_actor) THEN
    v_actor_role := 'admin_kab_kota';
  ELSIF v_assignment.referee_id = v_actor AND v_assignment.status = 'pending' AND p_target_status IN ('confirmed', 'declined') THEN
    v_actor_role := 'referee';
  END IF;
  IF v_actor_role = 'admin_provinsi' THEN
    IF (v_assignment.status = 'pending' AND p_target_status IN ('confirmed', 'cancelled'))
      OR (v_assignment.status = 'confirmed' AND p_target_status = 'cancelled') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_assignment.status, p_target_status;
    END IF;
  ELSIF v_actor_role = 'admin_kab_kota' THEN
    IF (v_assignment.status = 'pending' AND p_target_status IN ('confirmed', 'cancelled'))
      OR (v_assignment.status = 'confirmed' AND p_target_status = 'cancelled') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_assignment.status, p_target_status;
    END IF;
  ELSIF v_actor_role = 'referee' THEN
    IF v_assignment.status = 'pending' AND p_target_status IN ('confirmed', 'declined') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_assignment.status, p_target_status;
    END IF;
  ELSE
    IF public.has_role(v_actor, 'admin_kab_kota'::public.app_role)
      AND v_event_region IS NOT NULL
      AND v_event_region != public.get_user_kabupaten_kota(v_actor) THEN
      RAISE EXCEPTION 'CROSS_REGION_ACCESS';
    END IF;
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: % cannot mutate assignment status', v_actor;
  END IF;
  UPDATE public.event_assignments
  SET status = p_target_status,
      cancellation_reason = CASE WHEN p_target_status = 'cancelled' THEN COALESCE(p_reason, cancellation_reason) ELSE NULL END,
      cancelled_by = CASE WHEN p_target_status = 'cancelled' THEN v_actor ELSE cancelled_by END,
      updated_at = now()
  WHERE id = v_assignment.id
    AND status = v_old_status
  RETURNING * INTO v_assignment;
  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'CONCURRENT_STATUS_CHANGE';
  END IF;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, old_data, new_data, metadata)
  VALUES (
    'EVENT_ASSIGNMENT_STATUS_CHANGED',
    'event_assignments',
    v_assignment.id,
    v_actor,
    jsonb_build_object('status', v_old_status, 'referee_id', v_assignment.referee_id, 'event_id', v_assignment.event_id, 'reason', p_reason),
    jsonb_build_object('status', p_target_status, 'referee_id', v_assignment.referee_id, 'event_id', v_assignment.event_id, 'reason', p_reason, 'cancelled_by', CASE WHEN p_target_status = 'cancelled' THEN v_actor ELSE NULL END),
    jsonb_build_object('actor_role', v_actor_role, 'event_region', v_event_region, 'assignment_id', v_assignment.id, 'event_id', v_assignment.event_id, 'referee_id', v_assignment.referee_id)
  );
  RETURN v_assignment;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_event_assignment_status(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.transition_event_assignment_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_event_assignment_status(uuid, text, text) TO service_role;
CREATE TABLE IF NOT EXISTS public.issued_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  verification_token text NOT NULL UNIQUE,
  document_type text NOT NULL,
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.issued_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_issued_documents_document_number ON public.issued_documents(document_number);
CREATE INDEX IF NOT EXISTS idx_issued_documents_verification_token ON public.issued_documents(verification_token);
CREATE INDEX IF NOT EXISTS idx_issued_documents_document_type ON public.issued_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_issued_documents_status ON public.issued_documents(status);
CREATE INDEX IF NOT EXISTS idx_issued_documents_source_entity ON public.issued_documents(source_entity_type, source_entity_id);
DROP TRIGGER IF EXISTS update_issued_documents_updated_at ON public.issued_documents;
CREATE TRIGGER update_issued_documents_updated_at
BEFORE UPDATE ON public.issued_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.generate_official_document_number(
  p_document_type text,
  p_year integer DEFAULT EXTRACT(year FROM now())::int
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_sequence bigint;
BEGIN
  v_prefix := upper(regexp_replace(COALESCE(p_document_type, 'DOCUMENT'), '[^a-zA-Z0-9]+', '-', 'g'));
  SELECT COALESCE(MAX(CAST(split_part(document_number, '-', 3) AS bigint)), 0) + 1
  INTO v_sequence
  FROM public.issued_documents
  WHERE document_number LIKE v_prefix || '-' || p_year || '-%';
  RETURN format('%s-%s-%s', v_prefix, p_year, LPAD(v_sequence::text, 6, '0'));
END;
$$;
CREATE OR REPLACE FUNCTION public.issue_official_document(
  p_document_type text,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_snapshot jsonb DEFAULT '{}'::jsonb,
  p_content_hash text DEFAULT NULL,
  p_issued_by uuid DEFAULT NULL
)
RETURNS public.issued_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), p_issued_by);
  v_document public.issued_documents;
  v_document_number text;
  v_verification_token text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: authenticated user required';
  END IF;
  IF NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: admin role required to issue official documents';
  END IF;
  IF NULLIF(trim(p_document_type), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE';
  END IF;
  IF p_source_entity_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SOURCE_ENTITY_ID';
  END IF;
  IF p_content_hash IS NULL OR length(trim(p_content_hash)) = 0 THEN
    RAISE EXCEPTION 'INVALID_CONTENT_HASH';
  END IF;
  v_document_number := public.generate_official_document_number(p_document_type, EXTRACT(year FROM now())::int);
  v_verification_token := md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text);
  INSERT INTO public.issued_documents (document_number, verification_token, document_type, source_entity_type, source_entity_id, snapshot, content_hash, status, issued_by, issued_at)
  VALUES (v_document_number, v_verification_token, trim(p_document_type), COALESCE(p_source_entity_type, 'unknown'), p_source_entity_id, COALESCE(p_snapshot, '{}'::jsonb), trim(p_content_hash), 'issued', v_actor, now())
  RETURNING * INTO v_document;
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, new_data, metadata)
  VALUES (
    'issued_documents',
    v_document.id,
    'OFFICIAL_DOCUMENT_ISSUED',
    v_actor,
    jsonb_build_object('document_number', v_document.document_number, 'document_type', v_document.document_type, 'status', v_document.status, 'source_entity_type', v_document.source_entity_type, 'source_entity_id', v_document.source_entity_id::text, 'verification_token', v_document.verification_token),
    jsonb_build_object('content_hash', v_document.content_hash, 'issued_at', v_document.issued_at)
  );
  RETURN v_document;
END;
$$;
CREATE OR REPLACE FUNCTION public.verify_official_document(
  p_verification_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.issued_documents;
BEGIN
  IF NULLIF(trim(p_verification_token), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'status', 'not_found', 'message', 'Dokumen tidak ditemukan.');
  END IF;
  SELECT * INTO v_document FROM public.issued_documents WHERE verification_token = trim(p_verification_token) LIMIT 1;
  IF v_document.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'status', 'not_found', 'message', 'Dokumen tidak ditemukan.');
  END IF;
  IF v_document.status = 'revoked' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked', 'message', 'Dokumen telah dicabut.',
      'document', jsonb_build_object('id', v_document.id, 'document_number', v_document.document_number, 'document_type', v_document.document_type, 'issued_at', v_document.issued_at, 'status', v_document.status, 'content_hash', v_document.content_hash));
  END IF;
  IF v_document.content_hash IS NULL OR length(trim(v_document.content_hash)) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'status', 'integrity_failed', 'message', 'Integritas dokumen gagal diverifikasi.',
      'document', jsonb_build_object('id', v_document.id, 'document_number', v_document.document_number, 'document_type', v_document.document_type, 'issued_at', v_document.issued_at, 'status', v_document.status, 'content_hash', v_document.content_hash));
  END IF;
  RETURN jsonb_build_object('valid', true, 'status', 'issued', 'message', 'Dokumen valid dan diterbitkan secara resmi.',
    'document', jsonb_build_object('id', v_document.id, 'document_number', v_document.document_number, 'document_type', v_document.document_type, 'issued_at', v_document.issued_at, 'status', v_document.status, 'content_hash', v_document.content_hash));
END;
$$;
CREATE OR REPLACE FUNCTION public.revoke_official_document(
  p_verification_token text,
  p_reason text DEFAULT NULL
)
RETURNS public.issued_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_document public.issued_documents;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: authenticated user required';
  END IF;
  IF NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: admin role required to revoke official documents';
  END IF;
  SELECT * INTO v_document FROM public.issued_documents WHERE verification_token = trim(p_verification_token) FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND';
  END IF;
  UPDATE public.issued_documents
  SET status = 'revoked', revoked_by = v_actor, revoked_at = now(), revoked_reason = COALESCE(p_reason, 'Revoked by administrator'), updated_at = now()
  WHERE id = v_document.id
  RETURNING * INTO v_document;
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  VALUES ('issued_documents', v_document.id, 'OFFICIAL_DOCUMENT_REVOKED', v_actor,
    jsonb_build_object('status', 'issued'),
    jsonb_build_object('status', 'revoked', 'revoked_reason', v_document.revoked_reason),
    jsonb_build_object('verification_token', v_document.verification_token));
  RETURN v_document;
END;
$$;
REVOKE ALL ON TABLE public.issued_documents FROM public, anon;
REVOKE ALL ON FUNCTION public.generate_official_document_number(text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.issue_official_document(text, text, uuid, jsonb, text, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.verify_official_document(text) FROM public;
REVOKE ALL ON FUNCTION public.revoke_official_document(text, text) FROM public, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.issued_documents TO authenticated;
GRANT ALL ON TABLE public.issued_documents TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_official_document_number(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_official_document(text, text, uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_official_document(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_official_document(text, text) TO authenticated;
CREATE POLICY "Admins can manage issued documents"
ON public.issued_documents
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Authenticated users can read issued documents"
ON public.issued_documents
FOR SELECT
USING (auth.uid() IS NOT NULL);
CREATE TABLE IF NOT EXISTS public.private_whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'meta',
  api_base_url TEXT,
  api_key_ciphertext TEXT,
  sender_number TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.private_whatsapp_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_whatsapp_settings TO authenticated;
GRANT ALL ON TABLE public.private_whatsapp_settings TO service_role;
ALTER TABLE public.private_whatsapp_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS private_whatsapp_settings_updated_at ON public.private_whatsapp_settings;
CREATE TRIGGER private_whatsapp_settings_updated_at
BEFORE UPDATE ON public.private_whatsapp_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Admin Provinsi can manage WhatsApp secret"
ON public.private_whatsapp_settings
FOR ALL
USING (public.is_admin_provinsi(auth.uid()))
WITH CHECK (public.is_admin_provinsi(auth.uid()));
CREATE OR REPLACE VIEW public.public_whatsapp_settings
WITH (security_invoker = true)
AS
SELECT id, provider, api_base_url, sender_number, enabled, created_at, updated_at
FROM public.private_whatsapp_settings;
REVOKE ALL ON public.public_whatsapp_settings FROM anon;
GRANT SELECT ON public.public_whatsapp_settings TO authenticated;
CREATE OR REPLACE VIEW public.public_system_settings
WITH (security_invoker = true)
AS
SELECT id, key, value, description, updated_by, created_at, updated_at
FROM public.system_settings
WHERE key NOT IN ('resend_api_key','smtp_user','smtp_password','smtp_host','smtp_port','smtp_secure','whatsapp_api_key','whatsapp_base_url','whatsapp_sender_number','whatsapp_provider','whatsapp_enabled');
REVOKE ALL ON public.public_system_settings FROM anon;
GRANT SELECT ON public.public_system_settings TO authenticated;
CREATE TABLE IF NOT EXISTS public.public_application_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.public_application_settings FROM anon, authenticated;
GRANT SELECT ON public.public_application_settings TO authenticated;
GRANT ALL ON public.public_application_settings TO service_role;
CREATE TRIGGER public_application_settings_updated_at
BEFORE UPDATE ON public.public_application_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.public_application_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can read public application settings"
ON public.public_application_settings
FOR SELECT
TO authenticated
USING (true);
CREATE POLICY "service role can manage public application settings"
ON public.public_application_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
CREATE TABLE public.message_delivery_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL,
  event_type text NOT NULL,
  provider_request_id bigint NOT NULL,
  provider_send_id bigint NOT NULL,
  provider_message_id text,
  provider_status text NOT NULL,
  normalized_status text NOT NULL,
  processing_time_ms integer,
  payload_hash text NOT NULL,
  idempotency_key text NOT NULL,
  production boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  CONSTRAINT message_delivery_ledger_provider_check CHECK (provider = 'kirisan'),
  CONSTRAINT message_delivery_ledger_environment_check CHECK (environment IN ('test', 'production')),
  CONSTRAINT message_delivery_ledger_event_type_check CHECK (event_type = 'send_status'),
  CONSTRAINT message_delivery_ledger_normalized_status_check CHECK (normalized_status IN ('sent', 'failed', 'unknown')),
  CONSTRAINT message_delivery_ledger_production_consistency_check CHECK (production = (environment = 'production')),
  CONSTRAINT message_delivery_ledger_request_idempotency_key UNIQUE (provider, environment, event_type, provider_request_id),
  CONSTRAINT message_delivery_ledger_idempotency_key_key UNIQUE (idempotency_key)
);
CREATE INDEX message_delivery_ledger_status_received_at_idx ON public.message_delivery_ledger (provider, environment, normalized_status, received_at DESC);
CREATE INDEX message_delivery_ledger_provider_request_id_idx ON public.message_delivery_ledger (provider_request_id);
ALTER TABLE public.message_delivery_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_delivery_ledger FROM anon, authenticated;
GRANT ALL ON TABLE public.message_delivery_ledger TO service_role;
CREATE TABLE IF NOT EXISTS public.referee_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id UUID NOT NULL UNIQUE,
  whatsapp_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referee_contacts_referee_fk FOREIGN KEY (referee_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.assignment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL UNIQUE,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_sent_at TIMESTAMPTZ,
  email_error_code TEXT,
  whatsapp_status TEXT NOT NULL DEFAULT 'pending' CHECK (whatsapp_status IN ('pending', 'sent', 'failed', 'skipped')),
  whatsapp_sent_at TIMESTAMPTZ,
  whatsapp_provider TEXT CHECK (whatsapp_provider IS NULL OR whatsapp_provider IN ('meta', 'kirisan')),
  whatsapp_request_id BIGINT,
  whatsapp_error_code TEXT,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assignment_notifications_assignment_fk FOREIGN KEY (assignment_id) REFERENCES public.event_assignments(id) ON DELETE CASCADE
);
ALTER TABLE public.referee_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_notifications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER referee_contacts_updated_at BEFORE UPDATE ON public.referee_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER assignment_notifications_updated_at BEFORE UPDATE ON public.assignment_notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
REVOKE ALL ON TABLE public.referee_contacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.assignment_notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.referee_contacts TO service_role;
GRANT ALL ON TABLE public.assignment_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referee_contacts TO authenticated;
CREATE INDEX IF NOT EXISTS idx_referee_contacts_referee_id ON public.referee_contacts(referee_id);
CREATE INDEX IF NOT EXISTS idx_assignment_notifications_assignment_id ON public.assignment_notifications(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_notifications_whatsapp_request_id ON public.assignment_notifications(whatsapp_request_id);
ALTER TABLE public.referee_contacts ADD CONSTRAINT referee_contacts_whatsapp_number_format CHECK (whatsapp_number ~ '^62[0-9]{9,13}$');
CREATE POLICY "Referees can view their own whatsapp contact" ON public.referee_contacts FOR SELECT
  USING ((auth.uid() = referee_id) AND public.has_role(auth.uid(), 'wasit'::public.app_role));
CREATE POLICY "Referees can insert their own whatsapp contact" ON public.referee_contacts FOR INSERT
  WITH CHECK ((auth.uid() = referee_id) AND public.has_role(auth.uid(), 'wasit'::public.app_role));
CREATE POLICY "Referees can update their own whatsapp contact" ON public.referee_contacts FOR UPDATE
  USING ((auth.uid() = referee_id) AND public.has_role(auth.uid(), 'wasit'::public.app_role))
  WITH CHECK ((auth.uid() = referee_id) AND public.has_role(auth.uid(), 'wasit'::public.app_role));
CREATE POLICY "Referees can delete their own whatsapp contact" ON public.referee_contacts FOR DELETE
  USING ((auth.uid() = referee_id) AND public.has_role(auth.uid(), 'wasit'::public.app_role));
CREATE TABLE IF NOT EXISTS public.notification_channel_claims (
  assignment_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  claim_id UUID NOT NULL UNIQUE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, channel),
  CONSTRAINT notification_channel_claims_assignment_fk FOREIGN KEY (assignment_id) REFERENCES public.event_assignments(id) ON DELETE CASCADE,
  CONSTRAINT notification_channel_claims_expiry_chk CHECK (expires_at >= claimed_at)
);
ALTER TABLE public.notification_channel_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_channel_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.notification_channel_claims TO service_role;
CREATE TRIGGER notification_channel_claims_updated_at BEFORE UPDATE ON public.notification_channel_claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.claim_notification_channel(
  p_assignment_id uuid,
  p_channel text,
  p_claim_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email_status text;
  v_whatsapp_status text;
  v_has_valid_claim boolean := false;
  v_claimed text;
BEGIN
  IF p_assignment_id IS NULL OR p_claim_id IS NULL THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  IF p_channel IS DISTINCT FROM 'email' AND p_channel IS DISTINCT FROM 'whatsapp' THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  SELECT email_status, whatsapp_status INTO v_email_status, v_whatsapp_status
  FROM public.assignment_notifications
  WHERE assignment_id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  IF p_channel = 'email' AND v_email_status IN ('sent', 'failed', 'skipped') THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  IF p_channel = 'whatsapp' AND v_whatsapp_status IN ('sent', 'failed', 'skipped') THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.notification_channel_claims c
    WHERE c.assignment_id = p_assignment_id AND c.channel = p_channel AND c.expires_at > now()
  ) INTO v_has_valid_claim;
  IF v_has_valid_claim THEN
    RETURN 'NOT_CLAIMED';
  END IF;
  INSERT INTO public.notification_channel_claims (assignment_id, channel, claim_id, claimed_at, expires_at, created_at, updated_at)
  VALUES (p_assignment_id, p_channel, p_claim_id, now(), now() + interval '5 minutes', now(), now())
  ON CONFLICT (assignment_id, channel)
  DO UPDATE SET claim_id = EXCLUDED.claim_id, claimed_at = EXCLUDED.claimed_at, expires_at = EXCLUDED.expires_at, updated_at = now()
  WHERE public.notification_channel_claims.expires_at <= now()
  RETURNING 'CLAIMED' INTO v_claimed;
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;
  RETURN 'NOT_CLAIMED';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_notification_channel(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_channel(uuid, text, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_notification_channel(
  p_assignment_id uuid,
  p_channel text,
  p_claim_id uuid,
  p_status text,
  p_provider text DEFAULT NULL,
  p_request_id bigint DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected integer := 0;
BEGIN
  IF p_assignment_id IS NULL OR p_claim_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_channel IS DISTINCT FROM 'email' AND p_channel IS DISTINCT FROM 'whatsapp' THEN
    RETURN 0;
  END IF;
  IF p_status NOT IN ('sent', 'failed') THEN
    RETURN 0;
  END IF;
  IF p_channel = 'whatsapp' AND p_provider IS NOT NULL AND p_provider NOT IN ('meta', 'kirisan') THEN
    RETURN 0;
  END IF;
  IF p_channel = 'email' THEN
    UPDATE public.assignment_notifications n
    SET email_status = p_status,
        email_sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE n.email_sent_at END,
        email_error_code = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_code, 'provider_failed') ELSE NULL END,
        updated_at = now()
    FROM public.notification_channel_claims c
    WHERE n.assignment_id = p_assignment_id AND c.assignment_id = p_assignment_id AND c.channel = p_channel AND c.claim_id = p_claim_id AND n.email_status = 'pending';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
  ELSE
    UPDATE public.assignment_notifications n
    SET whatsapp_status = p_status,
        whatsapp_provider = p_provider,
        whatsapp_request_id = p_request_id,
        whatsapp_sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE n.whatsapp_sent_at END,
        whatsapp_error_code = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_code, 'provider_failed') ELSE NULL END,
        updated_at = now()
    FROM public.notification_channel_claims c
    WHERE n.assignment_id = p_assignment_id AND c.assignment_id = p_assignment_id AND c.channel = p_channel AND c.claim_id = p_claim_id AND n.whatsapp_status = 'pending';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
  END IF;
  IF v_affected = 1 THEN
    DELETE FROM public.notification_channel_claims c
    WHERE c.assignment_id = p_assignment_id AND c.channel = p_channel AND c.claim_id = p_claim_id;
  END IF;
  RETURN v_affected;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_notification_channel(uuid, text, uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_channel(uuid, text, uuid, text, text, bigint, text) TO service_role;
CREATE TABLE public.meta_webhook_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL,
  provider text NOT NULL,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  wamid text NOT NULL,
  lifecycle_status text NOT NULL,
  provider_event_timestamp bigint NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL,
  CONSTRAINT meta_webhook_events_provider_check CHECK (provider = 'meta'),
  CONSTRAINT meta_webhook_events_lifecycle_status_check CHECK (lifecycle_status IN ('sent', 'delivered', 'read', 'failed')),
  CONSTRAINT meta_webhook_events_event_key_unique UNIQUE (event_key)
);
ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_webhook_events FROM anon, authenticated, public;
GRANT ALL ON TABLE public.meta_webhook_events TO service_role;
CREATE TABLE public.event_completion_notifications (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  claim_id uuid,
  claimed_at timestamptz,
  expires_at timestamptz,
  provider text,
  provider_message_id text,
  provider_request_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  sent_at timestamptz,
  CONSTRAINT event_completion_notifications_identity_unique UNIQUE (event_id, referee_id, channel),
  CONSTRAINT event_completion_notifications_channel_check CHECK (channel IN ('email', 'whatsapp')),
  CONSTRAINT event_completion_notifications_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT event_completion_notifications_claim_pair_check CHECK (
    (claim_id IS NULL AND claimed_at IS NULL AND expires_at IS NULL)
    OR (claim_id IS NOT NULL AND claimed_at IS NOT NULL AND expires_at IS NOT NULL)
  ),
  CONSTRAINT event_completion_notifications_expiry_check CHECK (expires_at IS NULL OR expires_at >= claimed_at),
  CONSTRAINT event_completion_notifications_event_fk FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT event_completion_notifications_referee_fk FOREIGN KEY (referee_id) REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX event_completion_notifications_claim_id_unique ON public.event_completion_notifications(claim_id) WHERE claim_id IS NOT NULL;
CREATE INDEX event_completion_notifications_event_idx ON public.event_completion_notifications(event_id);
CREATE INDEX event_completion_notifications_wamid_idx ON public.event_completion_notifications(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX event_completion_notifications_expiry_idx ON public.event_completion_notifications(status, expires_at, channel);
ALTER TABLE public.event_completion_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_completion_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.event_completion_notifications TO service_role;
CREATE OR REPLACE FUNCTION public.create_event_completion_notification_intents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'DISETUJUI' OR NEW.status IS DISTINCT FROM 'SELESAI' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.event_completion_notifications (event_id, referee_id, channel, status)
  SELECT NEW.id, eligible.referee_id, eligible.channel, eligible.status
  FROM (
    SELECT DISTINCT ea.referee_id, 'email'::text AS channel,
      CASE WHEN NULLIF(pg_catalog.btrim(p.email), '') IS NULL THEN 'skipped' ELSE 'pending' END AS status
    FROM public.event_assignments ea
    JOIN public.profiles p ON p.id = ea.referee_id
    WHERE ea.event_id = NEW.id AND ea.status = 'confirmed' AND ea.deleted_at IS NULL
    UNION ALL
    SELECT DISTINCT ea.referee_id, 'whatsapp'::text AS channel,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.referee_contacts rc
        WHERE rc.referee_id = ea.referee_id AND NULLIF(pg_catalog.btrim(rc.whatsapp_number), '') IS NOT NULL
      ) THEN 'pending' ELSE 'skipped' END AS status
    FROM public.event_assignments ea
    WHERE ea.event_id = NEW.id AND ea.status = 'confirmed' AND ea.deleted_at IS NULL
  ) AS eligible
  ON CONFLICT (event_id, referee_id, channel) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_completion_notification_intents_trigger
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (OLD.status = 'DISETUJUI' AND NEW.status = 'SELESAI')
EXECUTE FUNCTION public.create_event_completion_notification_intents();
REVOKE ALL ON FUNCTION public.create_event_completion_notification_intents() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.claim_event_completion_notification(
  p_event_id uuid,
  p_referee_id uuid,
  p_channel text
)
RETURNS SETOF public.event_completion_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.event_completion_notifications;
BEGIN
  IF p_event_id IS NULL OR p_referee_id IS NULL OR p_channel NOT IN ('email', 'whatsapp') THEN
    RETURN;
  END IF;
  UPDATE public.event_completion_notifications n
  SET claim_id = pg_catalog.gen_random_uuid(),
      claimed_at = pg_catalog.now(),
      expires_at = pg_catalog.now() + pg_catalog.make_interval(mins => 5),
      updated_at = pg_catalog.now()
  WHERE n.event_id = p_event_id AND n.referee_id = p_referee_id AND n.channel = p_channel AND n.status = 'pending'
    AND (n.claim_id IS NULL OR n.expires_at <= pg_catalog.now())
  RETURNING n.* INTO claimed;
  IF FOUND THEN
    RETURN NEXT claimed;
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_event_completion_notification(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_completion_notification(uuid, uuid, text) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_event_completion_notification(
  p_event_id uuid,
  p_referee_id uuid,
  p_channel text,
  p_claim_id uuid,
  p_status text,
  p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_provider_request_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected integer;
BEGIN
  IF p_event_id IS NULL OR p_referee_id IS NULL OR p_claim_id IS NULL
     OR p_channel NOT IN ('email', 'whatsapp')
     OR p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RETURN 0;
  END IF;
  UPDATE public.event_completion_notifications n
  SET status = p_status,
      provider = p_provider,
      provider_message_id = p_provider_message_id,
      provider_request_id = p_provider_request_id,
      error_code = p_error_code,
      sent_at = CASE WHEN p_status = 'sent' THEN pg_catalog.now() ELSE n.sent_at END,
      claim_id = NULL,
      claimed_at = NULL,
      expires_at = NULL,
      updated_at = pg_catalog.now()
  WHERE n.event_id = p_event_id AND n.referee_id = p_referee_id AND n.channel = p_channel AND n.claim_id = p_claim_id AND n.status = 'pending';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_event_completion_notification(uuid, uuid, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_event_completion_notification(uuid, uuid, text, uuid, text, text, text, text, text) TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;