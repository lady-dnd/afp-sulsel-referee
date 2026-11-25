CREATE OR REPLACE FUNCTION public.has_any_app_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IS NOT NULL
  );
$$;

-- 1. public.notifications INSERT
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Approved staff or owners can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'panitia'::public.app_role)
  OR public.has_role(auth.uid(), 'evaluator'::public.app_role)
);

-- 2. public.pengurus SELECT
DROP POLICY IF EXISTS "Anyone authenticated can view pengurus" ON public.pengurus;
CREATE POLICY "Members can view pengurus"
ON public.pengurus
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_any_app_role(auth.uid())
);

-- 3. public.issued_documents SELECT
DROP POLICY IF EXISTS "Authenticated users can read issued documents" ON public.issued_documents;
CREATE POLICY "Issuers and admins can read issued documents"
ON public.issued_documents
FOR SELECT
TO authenticated
USING (
  auth.uid() = issued_by
  OR public.is_admin(auth.uid())
);

-- 4. public.discussion_replies SELECT
DROP POLICY IF EXISTS "Authenticated users can view replies" ON public.discussion_replies;
CREATE POLICY "Members can view replies"
ON public.discussion_replies
FOR SELECT
TO authenticated
USING (
  auth.uid() = author_id
  OR public.has_any_app_role(auth.uid())
);

-- 5. public.discussion_topics SELECT
DROP POLICY IF EXISTS "Authenticated users can view topics" ON public.discussion_topics;
CREATE POLICY "Members can view topics"
ON public.discussion_topics
FOR SELECT
TO authenticated
USING (
  auth.uid() = author_id
  OR public.has_any_app_role(auth.uid())
);

-- 6. public.event_approvals SELECT
DROP POLICY IF EXISTS "Everyone can view event approvals" ON public.event_approvals;
CREATE POLICY "Event creators and approvers can view event approvals"
ON public.event_approvals
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR approver_id = auth.uid()
  OR approved_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_approvals.event_id
      AND e.created_by = auth.uid()
  )
);

-- 7. public.referee_reviews INSERT & SELECT
DROP POLICY IF EXISTS "Anyone can submit reviews" ON public.referee_reviews;
CREATE POLICY "Public can submit valid reviews for active referees"
ON public.referee_reviews
FOR INSERT
TO anon, authenticated
WITH CHECK (
  rating >= 1
  AND rating <= 5
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN public.user_roles ur
      ON ur.user_id = p.id
      AND ur.role = 'wasit'::public.app_role
    WHERE p.id = referee_reviews.referee_id
      AND p.deleted_at IS NULL
      AND p.registration_status = 'approved'
      AND COALESCE(p.is_active, true) = true
  )
);

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.referee_reviews;
CREATE POLICY "Public can view reviews for active referees"
ON public.referee_reviews
FOR SELECT
TO anon, authenticated
USING (
  public.is_admin(auth.uid())
  OR auth.uid() = referee_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN public.user_roles ur
      ON ur.user_id = p.id
      AND ur.role = 'wasit'::public.app_role
    WHERE p.id = referee_reviews.referee_id
      AND p.deleted_at IS NULL
      AND p.registration_status = 'approved'
  )
);

-- 8. public.audit_logs INSERT
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated actors can insert own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

-- 9. storage.objects avatars SELECT
DROP POLICY IF EXISTS "Users can view their own avatar files" ON storage.objects;
CREATE POLICY "Users can view their own avatar files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    OR owner_id = (SELECT auth.uid()::text)
    OR public.is_admin((SELECT auth.uid()))
  )
);

-- 10. storage.objects documents INSERT
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    OR (
      (storage.foldername(name))[1] = 'temp'
      AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
    )
  )
);

-- 11. storage.objects documents SELECT
DROP POLICY IF EXISTS "Authenticated users can read documents" ON storage.objects;
CREATE POLICY "Authenticated users can read documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    OR (
      (storage.foldername(name))[1] = 'temp'
      AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
    )
    OR owner_id = (SELECT auth.uid()::text)
    OR public.is_admin((SELECT auth.uid()))
  )
);