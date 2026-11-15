ALTER TABLE public.event_approvals
  ADD CONSTRAINT event_approvals_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.event_approvals VALIDATE CONSTRAINT event_approvals_event_id_fkey;
CREATE INDEX IF NOT EXISTS idx_event_approvals_event_id ON public.event_approvals(event_id);