-- 1. Tighten event_assignments RLS: remove panitia from write/manage, allow event creator read-only
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.event_assignments;
CREATE POLICY "Admins can manage assignments"
ON public.event_assignments
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.events scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
)
WITH CHECK (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.events scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Admins can view all assignments" ON public.event_assignments;
CREATE POLICY "Admins can view all assignments"
ON public.event_assignments
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.events scoped_event
      WHERE scoped_event.id = event_assignments.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
  OR (referee_id = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.events own_event
    WHERE own_event.id = event_assignments.event_id
      AND own_event.created_by = auth.uid()
  )
);

-- 2. Tighten events RLS: Admin Provinsi full access, Admin Kab/Kota regional, Panitia submit & edit own DIAJUKAN only
DROP POLICY IF EXISTS "Admins can create events" ON public.events;
CREATE POLICY "Admins can create events"
ON public.events
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
  )
  OR (
    public.has_role(auth.uid(), 'panitia'::public.app_role)
    AND created_by = auth.uid()
    AND status = 'DIAJUKAN'
  )
);

DROP POLICY IF EXISTS "Admins can update events" ON public.events;
CREATE POLICY "Admins can update events"
ON public.events
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
  )
  OR (
    public.has_role(auth.uid(), 'panitia'::public.app_role)
    AND created_by = auth.uid()
    AND status = 'DIAJUKAN'
  )
)
WITH CHECK (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
  )
  OR (
    public.has_role(auth.uid(), 'panitia'::public.app_role)
    AND created_by = auth.uid()
    AND status = 'DIAJUKAN'
  )
);

DROP POLICY IF EXISTS "Admins can delete events" ON public.events;
CREATE POLICY "Admins can delete events"
ON public.events
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    AND status = 'DIAJUKAN'
  )
);

-- 3. Tighten event_approvals RLS: Admin Provinsi (all) & Admin Kab/Kota (regional); Panitia only pending log for own event
DROP POLICY IF EXISTS "Admin can insert approvals" ON public.event_approvals;
CREATE POLICY "Admin can insert approvals"
ON public.event_approvals
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.events scoped_event
      WHERE scoped_event.id = event_approvals.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
  OR (
    public.has_role(auth.uid(), 'panitia'::public.app_role)
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.events own_event
      WHERE own_event.id = event_approvals.event_id
        AND own_event.created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins can manage event approvals" ON public.event_approvals;
CREATE POLICY "Admins can manage event approvals"
ON public.event_approvals
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  public.is_admin_provinsi(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.events scoped_event
      WHERE scoped_event.id = event_approvals.event_id
        AND scoped_event.kabupaten_kota_id = public.get_user_kabupaten_kota(auth.uid())
    )
  )
);