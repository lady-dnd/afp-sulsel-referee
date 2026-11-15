CREATE OR REPLACE FUNCTION public.log_event_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  v_action := COALESCE(NEW.action, NEW.status, 'approval');
  INSERT INTO public.activity_logs (actor_id, entity, entity_id, action, metadata, created_at)
  VALUES (
    COALESCE(NEW.approved_by, NEW.approver_id, auth.uid()),
    'event',
    NEW.event_id,
    v_action,
    jsonb_build_object('status', NEW.status, 'notes', NEW.notes),
    now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_event_approval() FROM PUBLIC, anon, authenticated;