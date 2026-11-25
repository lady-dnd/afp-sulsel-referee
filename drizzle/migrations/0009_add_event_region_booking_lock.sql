CREATE OR REPLACE FUNCTION public.prevent_event_region_date_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_conflict record;
BEGIN
  -- Only enforce booking lock for active, non-deleted events with a region
  IF NEW.deleted_at IS NOT NULL
     OR NEW.kabupaten_kota_id IS NULL
     OR NEW.status NOT IN ('DIAJUKAN', 'DISETUJUI') THEN
    RETURN NEW;
  END IF;

  v_start := COALESCE(NEW.start_date, NEW.date);
  v_end := COALESCE(NEW.end_date, NEW.start_date, NEW.date);

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_end < v_start THEN
    RAISE EXCEPTION 'INVALID_EVENT_DATE_RANGE: Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'
      USING ERRCODE = '22007';
  END IF;

  -- Serialize concurrent bookings for the same region
  PERFORM pg_advisory_xact_lock(hashtext('event_booking_' || NEW.kabupaten_kota_id::text));

  SELECT
    e.id,
    e.name,
    COALESCE(e.start_date, e.date) AS eff_start,
    COALESCE(e.end_date, e.start_date, e.date) AS eff_end,
    e.status
  INTO v_conflict
  FROM public.events e
  WHERE e.deleted_at IS NULL
    AND e.kabupaten_kota_id = NEW.kabupaten_kota_id
    AND e.status IN ('DIAJUKAN', 'DISETUJUI')
    AND e.id IS DISTINCT FROM NEW.id
    AND COALESCE(e.start_date, e.date) <= v_end
    AND COALESCE(e.end_date, e.start_date, e.date) >= v_start
  ORDER BY COALESCE(e.start_date, e.date) ASC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'EVENT_DATE_CONFLICT: Tanggal bentrok dengan event "%" (% s/d %) di wilayah yang sama.',
      v_conflict.name,
      to_char(v_conflict.eff_start, 'DD-MM-YYYY'),
      to_char(v_conflict.eff_end, 'DD-MM-YYYY')
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_region_date_overlap ON public.events;
CREATE TRIGGER trg_prevent_event_region_date_overlap
BEFORE INSERT OR UPDATE OF kabupaten_kota_id, date, start_date, end_date, status, deleted_at
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_event_region_date_overlap();

REVOKE ALL ON FUNCTION public.prevent_event_region_date_overlap() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_event_schedule_conflict(
  p_kabupaten_kota_id uuid,
  p_start_date date,
  p_end_date date,
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflict_event_id uuid,
  conflict_event_name text,
  conflict_start_date date,
  conflict_end_date date,
  conflict_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS conflict_event_id,
    e.name AS conflict_event_name,
    COALESCE(e.start_date, e.date) AS conflict_start_date,
    COALESCE(e.end_date, e.start_date, e.date) AS conflict_end_date,
    e.status AS conflict_status
  FROM public.events e
  WHERE e.deleted_at IS NULL
    AND e.kabupaten_kota_id = p_kabupaten_kota_id
    AND e.status IN ('DIAJUKAN', 'DISETUJUI')
    AND (p_exclude_event_id IS NULL OR e.id <> p_exclude_event_id)
    AND COALESCE(e.start_date, e.date) <= p_end_date
    AND COALESCE(e.end_date, e.start_date, e.date) >= p_start_date
  ORDER BY COALESCE(e.start_date, e.date) ASC;
$$;

REVOKE ALL ON FUNCTION public.check_event_schedule_conflict(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_event_schedule_conflict(uuid, date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_booked_event_dates(
  p_kabupaten_kota_id uuid,
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_name text,
  start_date date,
  end_date date,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS event_id,
    e.name AS event_name,
    COALESCE(e.start_date, e.date) AS start_date,
    COALESCE(e.end_date, e.start_date, e.date) AS end_date,
    e.status AS status
  FROM public.events e
  WHERE e.deleted_at IS NULL
    AND e.kabupaten_kota_id = p_kabupaten_kota_id
    AND e.status IN ('DIAJUKAN', 'DISETUJUI')
    AND (p_exclude_event_id IS NULL OR e.id <> p_exclude_event_id)
  ORDER BY COALESCE(e.start_date, e.date) ASC;
$$;

REVOKE ALL ON FUNCTION public.get_booked_event_dates(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_event_dates(uuid, uuid) TO anon, authenticated, service_role;