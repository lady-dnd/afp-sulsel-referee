CREATE OR REPLACE FUNCTION public.approve_registration(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR';
  END IF;
  IF _role NOT IN ('wasit', 'panitia') THEN
    RAISE EXCEPTION 'INVALID_ROLE: %', _role;
  END IF;
  IF NOT public.can_approve_registration(v_actor, _user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_REGION_SCOPE';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;
  UPDATE public.profiles
  SET registration_status = 'approved',
      requested_role = _role,
      rejected_reason = NULL,
      approved_at = now(),
      approved_by = v_actor,
      updated_at = now()
  WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role IS NULL;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role::public.app_role) THEN
    INSERT INTO public.user_roles (user_id, email, role) VALUES (_user_id, v_email, _role::public.app_role);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_registration(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_registration(_user_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR';
  END IF;
  IF NOT public.can_approve_registration(v_actor, _user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_REGION_SCOPE';
  END IF;
  UPDATE public.profiles
  SET registration_status = 'rejected',
      rejected_reason = NULLIF(trim(_reason), ''),
      approved_at = now(),
      approved_by = v_actor,
      updated_at = now()
  WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_registration(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_view_count(topic_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.discussion_topics
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = topic_id AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.increment_view_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_view_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_event_completed(p_event_id uuid, p_notes text DEFAULT NULL)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event public.events;
  v_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id AND deleted_at IS NULL FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;
  IF public.is_admin_provinsi(v_actor) THEN
    v_role := 'admin_provinsi';
  ELSIF public.has_role(v_actor, 'admin_kab_kota'::public.app_role)
    AND v_event.kabupaten_kota_id IS NOT NULL
    AND v_event.kabupaten_kota_id = public.get_user_kabupaten_kota(v_actor) THEN
    v_role := 'admin_kab_kota';
  ELSE
    RAISE EXCEPTION 'FORBIDDEN_EVENT_SCOPE';
  END IF;
  IF v_event.status IS DISTINCT FROM 'DISETUJUI' THEN
    RAISE EXCEPTION 'EVENT_NOT_COMPLETABLE';
  END IF;
  UPDATE public.events SET status = 'SELESAI', updated_at = now()
  WHERE id = p_event_id
  RETURNING * INTO v_event;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, old_data, new_data, metadata)
  VALUES ('EVENT_COMPLETED', 'events', v_event.id, v_actor,
    jsonb_build_object('status', 'DISETUJUI'),
    jsonb_build_object('status', 'SELESAI'),
    jsonb_build_object('actor_role', v_role, 'notes', p_notes));
  RETURN v_event;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_event_completed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_event_completed(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.issue_my_referee_card()
RETURNS public.referee_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_card public.referee_cards;
  v_profile public.profiles;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR';
  END IF;
  SELECT * INTO v_card FROM public.referee_cards WHERE referee_id = v_actor LIMIT 1;
  IF v_card.id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_actor;
  IF v_profile.id IS NULL
    OR NOT public.has_role(v_actor, 'wasit'::public.app_role)
    OR COALESCE(v_profile.is_profile_complete, false) = false
    OR COALESCE(v_profile.registration_status, 'approved') <> 'approved' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.referee_cards (referee_id, card_number, verification_code, expires_at, status)
  VALUES (v_actor, public.generate_card_number(v_actor), replace(gen_random_uuid()::text, '-', ''), v_profile.license_expiry, 'active')
  RETURNING * INTO v_card;
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_my_referee_card() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_my_referee_card() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.regenerate_my_referee_card()
RETURNS public.referee_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_card public.referee_cards;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR';
  END IF;
  UPDATE public.referee_cards
  SET verification_code = replace(gen_random_uuid()::text, '-', ''),
      updated_at = now()
  WHERE referee_id = v_actor
  RETURNING * INTO v_card;
  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Anda belum memiliki ID Card';
  END IF;
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION public.regenerate_my_referee_card() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_my_referee_card() TO authenticated, service_role;