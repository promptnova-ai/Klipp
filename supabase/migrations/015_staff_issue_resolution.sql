-- Staff issue-resolution workflow for Klipp.
ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS issues_status_created_idx
  ON public.issues (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_list_issues()
RETURNS TABLE (
  issue_id uuid,
  booking_id uuid,
  reporter_id uuid,
  reporter_name text,
  reporter_email text,
  professional_name text,
  category text,
  description text,
  status issue_status,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  booking_status booking_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission('support.manage') THEN
    RAISE EXCEPTION 'permission denied: support.manage';
  END IF;

  RETURN QUERY
  SELECT i.id, i.booking_id, i.reporter_id,
         reporter.full_name,
         au.email,
         professional.full_name,
         i.category, i.description, i.status,
         i.created_at, i.updated_at, i.resolved_at,
         i.resolution_note, b.status
  FROM public.issues i
  JOIN public.bookings b ON b.id = i.booking_id
  JOIN public.profiles reporter ON reporter.id = i.reporter_id
  LEFT JOIN auth.users au ON au.id = i.reporter_id
  LEFT JOIN public.profiles professional ON professional.id = b.pro_id
  ORDER BY
    CASE i.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
    i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_issue(
  p_issue_id uuid,
  p_status issue_status,
  p_resolution_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous issue_status;
  v_reporter uuid;
BEGIN
  IF NOT public.has_admin_permission('support.manage') THEN
    RAISE EXCEPTION 'permission denied: support.manage';
  END IF;
  IF p_issue_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'issue and status are required';
  END IF;
  IF p_status NOT IN ('open', 'in_review', 'resolved') THEN
    RAISE EXCEPTION 'invalid issue status';
  END IF;
  IF p_status = 'resolved' AND NULLIF(trim(p_resolution_note), '') IS NULL THEN
    RAISE EXCEPTION 'a resolution note is required';
  END IF;
  SELECT status, reporter_id INTO v_previous, v_reporter
  FROM public.issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue not found'; END IF;

  UPDATE public.issues
  SET status = p_status,
      resolution_note = CASE WHEN p_status = 'resolved' THEN trim(p_resolution_note) ELSE NULL END,
      resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_status = 'resolved' THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE id = p_issue_id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'support.issue_status_changed', p_issue_id,
    jsonb_build_object(
      'reporter_id', v_reporter,
      'from', v_previous,
      'to', p_status,
      'resolution_note', CASE WHEN p_status = 'resolved' THEN trim(p_resolution_note) ELSE NULL END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_issues() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_issue(uuid, issue_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_issues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_issue(uuid, issue_status, text) TO authenticated;
