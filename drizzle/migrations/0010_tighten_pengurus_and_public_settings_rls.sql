-- 1. Remove overly permissive public SELECT policy on pengurus.
-- Authenticated members with an app role (or the pengurus user themselves)
-- retain access through the existing "Members can view pengurus" policy.
DROP POLICY IF EXISTS "Everyone can view pengurus" ON public.pengurus;

-- 2. Replace USING (true) SELECT policy on public_application_settings
-- so only users with an assigned application role can read settings.
DROP POLICY IF EXISTS "authenticated users can read public application settings" ON public.public_application_settings;
CREATE POLICY "App members can read public application settings"
  ON public.public_application_settings
  FOR SELECT
  TO authenticated
  USING (public.has_any_app_role(auth.uid()));