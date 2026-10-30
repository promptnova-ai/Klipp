-- Klipp Phase 2: enforce staff permissions and expose owner-only staff management RPCs.
-- This migration is prepared for review only; do not execute without explicit approval.

-- Critical settings are deliberately excluded from every employee template.
INSERT INTO public.staff_permissions (code, description, sensitive)
VALUES ('settings.critical', 'Modificar parámetros críticos de la plataforma', true)
ON CONFLICT (code) DO NOTHING;

-- Existing account operations are now permission-specific.
CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE (
  user_id uuid,
  email text,
  email_verified boolean,
  full_name text,
  phone text,
  role user_role,
  created_at timestamptz,
  verification_status verification_status,
  id_document_path text,
  verification_note text,
  verification_reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_admin_permission('accounts.read') THEN
    RAISE EXCEPTION 'permission denied: accounts.read';
  END IF;

  RETURN QUERY
  SELECT p.id, u.email::text, u.email_confirmed_at IS NOT NULL,
         p.full_name, p.phone, p.role, p.created_at,
         pp.verification_status, pp.id_document_path, pp.verification_note,
         pp.verification_reviewed_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.pro_profiles pp ON pp.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_role user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role user_role;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'user and role are required';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot change your own role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_owner
    WHERE singleton = true AND owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'the platform owner account is protected';
  END IF;

  SELECT role INTO target_role
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  IF p_role::text = 'admin' OR target_role::text = 'admin' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'only the platform owner can grant or revoke administrator access';
    END IF;
  ELSIF NOT public.has_admin_permission('accounts.manage_clients') THEN
    RAISE EXCEPTION 'permission denied: accounts.manage_clients';
  END IF;

  IF p_role::text = 'pro' THEN
    INSERT INTO public.pro_profiles (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'account.role_changed', p_user_id,
    jsonb_build_object('role', p_role::text, 'previous_role', target_role::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_professional(
  p_pro_id uuid,
  p_status verification_status,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
BEGIN
  IF NOT public.has_admin_permission('verification.review') THEN
    RAISE EXCEPTION 'permission denied: verification.review';
  END IF;
  IF p_pro_id IS NULL THEN
    RAISE EXCEPTION 'professional id is required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'review status must be approved or rejected';
  END IF;
  IF p_status = 'rejected' AND NULLIF(TRIM(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'a reason is required when rejecting verification';
  END IF;
  IF p_status = 'approved' AND NOT EXISTS (
    SELECT 1
    FROM public.pro_profiles pp
    JOIN storage.objects object
      ON object.bucket_id = 'pro-verification-documents'
     AND object.name = pp.id_document_path
    JOIN auth.users u ON u.id = pp.user_id
    WHERE pp.user_id = p_pro_id
      AND pp.id_document_path IS NOT NULL
      AND split_part(pp.id_document_path, '/', 1) = p_pro_id::text
      AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'professional must confirm email and submit an identity document before approval';
  END IF;

  UPDATE public.pro_profiles
  SET verification_status = p_status,
      verification_note = NULLIF(TRIM(p_note), ''),
      verification_reviewed_at = now(),
      verification_reviewed_by = auth.uid()
  WHERE user_id = p_pro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional profile not found';
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'professional.verification_reviewed', p_pro_id,
    jsonb_build_object('status', p_status, 'note', NULLIF(TRIM(p_note), ''))
  );
END;
$$;

-- Viewing operational settings requires the matching read permission.
CREATE OR REPLACE FUNCTION public.admin_get_platform_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_admin_permission('settings.operational') THEN
    RAISE EXCEPTION 'permission denied: settings.operational';
  END IF;
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO result
  FROM public.platform_settings;
  RETURN result;
END;
$$;

-- Commission and request-expiry values can affect revenue and core workflows.
-- They are intentionally super-admin-only rather than employee-operational settings.
CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(
  p_commission_pct numeric,
  p_request_expiry_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can change critical platform settings';
  END IF;
  IF p_commission_pct IS NULL OR p_commission_pct < 0 OR p_commission_pct > 50 THEN
    RAISE EXCEPTION 'commission must be between 0 and 50 percent';
  END IF;
  IF p_request_expiry_minutes IS NULL OR p_request_expiry_minutes NOT BETWEEN 15 AND 1440 THEN
    RAISE EXCEPTION 'request expiry must be between 15 and 1440 minutes';
  END IF;

  INSERT INTO public.platform_settings (key, value, updated_at, updated_by)
  VALUES
    ('commission_pct', to_jsonb(p_commission_pct), now(), auth.uid()),
    ('request_expiry_minutes', to_jsonb(p_request_expiry_minutes), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

  INSERT INTO public.admin_audit_log (actor_id, action, details)
  VALUES (
    auth.uid(), 'platform.critical_settings_updated',
    jsonb_build_object(
      'commission_pct', p_commission_pct,
      'request_expiry_minutes', p_request_expiry_minutes
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_service_categories()
RETURNS TABLE (id integer, name text, description text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission('catalog.manage') THEN
    RAISE EXCEPTION 'permission denied: catalog.manage';
  END IF;
  RETURN QUERY
  SELECT category.id, category.name, category.description, category.active
  FROM public.service_categories category
  ORDER BY category.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_service_category(
  p_category_id integer,
  p_name text,
  p_description text,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission('catalog.manage') THEN
    RAISE EXCEPTION 'permission denied: catalog.manage';
  END IF;
  IF NULLIF(TRIM(p_name), '') IS NULL OR length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'category name must contain 1 to 100 characters';
  END IF;
  IF p_description IS NULL OR length(p_description) > 500 THEN
    RAISE EXCEPTION 'category description must contain at most 500 characters';
  END IF;

  UPDATE public.service_categories
  SET name = trim(p_name), description = p_description, active = p_active
  WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service category not found';
  END IF;
  IF NOT p_active THEN
    UPDATE public.service_types SET active = false WHERE category_id = p_category_id;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, details)
  VALUES (
    auth.uid(), 'catalog.category_updated',
    jsonb_build_object('category_id', p_category_id, 'active', p_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_service_type(
  p_service_type_id integer,
  p_name text,
  p_description text,
  p_active boolean,
  p_category_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission('catalog.manage') THEN
    RAISE EXCEPTION 'permission denied: catalog.manage';
  END IF;
  IF NULLIF(TRIM(p_name), '') IS NULL OR length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'service name must contain 1 to 100 characters';
  END IF;
  IF p_description IS NULL OR length(p_description) > 500 THEN
    RAISE EXCEPTION 'service description must contain at most 500 characters';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_categories WHERE id = p_category_id AND active
  ) THEN
    RAISE EXCEPTION 'service category not found';
  END IF;

  UPDATE public.service_types
  SET name = trim(p_name), description = p_description,
      active = p_active, category_id = p_category_id
  WHERE id = p_service_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service type not found';
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, details)
  VALUES (
    auth.uid(), 'catalog.service_updated',
    jsonb_build_object(
      'service_type_id', p_service_type_id,
      'active', p_active,
      'category_id', p_category_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_pricing_tier(
  p_tier_id integer,
  p_label text,
  p_price_dop numeric,
  p_est_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission('catalog.manage') THEN
    RAISE EXCEPTION 'permission denied: catalog.manage';
  END IF;
  IF NULLIF(TRIM(p_label), '') IS NULL OR length(trim(p_label)) > 100 THEN
    RAISE EXCEPTION 'pricing label must contain 1 to 100 characters';
  END IF;
  IF p_price_dop IS NULL OR p_price_dop <= 0 OR p_price_dop > 1000000 THEN
    RAISE EXCEPTION 'price must be between 0 and 1000000 DOP';
  END IF;
  IF p_est_minutes IS NULL OR p_est_minutes NOT BETWEEN 15 AND 1440 THEN
    RAISE EXCEPTION 'duration must be between 15 and 1440 minutes';
  END IF;

  UPDATE public.pricing_tiers
  SET label = trim(p_label), price_dop = p_price_dop, est_minutes = p_est_minutes
  WHERE id = p_tier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing tier not found';
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, details)
  VALUES (auth.uid(), 'catalog.pricing_tier_updated', jsonb_build_object('pricing_tier_id', p_tier_id));
END;
$$;

-- Staff access is visible and mutable only to the unique platform owner.
CREATE OR REPLACE FUNCTION public.admin_list_staff_access()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  template_key text,
  is_owner boolean,
  permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can manage staff access';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    COALESCE(assignment.template_key, 'custom')::text,
    owner_record.owner_user_id = p.id,
    COALESCE(permission_list.items, '[]'::jsonb)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.staff_role_assignments assignment ON assignment.user_id = p.id
  CROSS JOIN public.platform_owner owner_record
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', permission.code,
        'description', permission.description,
        'sensitive', permission.sensitive,
        'allowed', COALESCE(override_record.allowed, template_permission.permission_code IS NOT NULL),
        'overridden', override_record.permission_code IS NOT NULL
      ) ORDER BY permission.code
    ) AS items
    FROM public.staff_permissions permission
    LEFT JOIN public.staff_permission_overrides override_record
      ON override_record.user_id = p.id
     AND override_record.permission_code = permission.code
    LEFT JOIN public.staff_role_template_permissions template_permission
      ON template_permission.template_key = assignment.template_key
     AND template_permission.permission_code = permission.code
  ) permission_list ON true
  WHERE p.role::text = 'admin'
  ORDER BY (owner_record.owner_user_id = p.id) DESC, lower(COALESCE(u.email, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_staff_templates()
RETURNS TABLE (
  template_key text,
  name text,
  description text,
  permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can manage staff access';
  END IF;

  RETURN QUERY
  SELECT
    template.template_key,
    template.name,
    template.description,
    COALESCE(
      jsonb_agg(permission_map.permission_code ORDER BY permission_map.permission_code)
        FILTER (WHERE permission_map.permission_code IS NOT NULL),
      '[]'::jsonb
    )
  FROM public.staff_role_templates template
  LEFT JOIN public.staff_role_template_permissions permission_map
    ON permission_map.template_key = template.template_key
  GROUP BY template.template_key, template.name, template.description
  ORDER BY template.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_staff_template(
  p_user_id uuid,
  p_template_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can manage staff access';
  END IF;
  IF p_user_id IS NULL OR p_template_key IS NULL THEN
    RAISE EXCEPTION 'staff user and template are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_owner
    WHERE singleton = true AND owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'the platform owner permissions cannot be changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'target user is not an administrator';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_role_templates
    WHERE template_key = p_template_key
  ) THEN
    RAISE EXCEPTION 'staff template not found';
  END IF;

  INSERT INTO public.staff_role_assignments (user_id, template_key, assigned_by, assigned_at)
  VALUES (p_user_id, p_template_key, auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET template_key = EXCLUDED.template_key,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'staff.template_assigned', p_user_id,
    jsonb_build_object('template_key', p_template_key)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_staff_permission(
  p_user_id uuid,
  p_permission_code text,
  p_allowed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_allowed boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can manage staff access';
  END IF;
  IF p_user_id IS NULL OR p_permission_code IS NULL THEN
    RAISE EXCEPTION 'staff user and permission are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_owner
    WHERE singleton = true AND owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'the platform owner permissions cannot be changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'target user is not an administrator';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE code = p_permission_code
  ) THEN
    RAISE EXCEPTION 'unknown staff permission';
  END IF;

  SELECT allowed INTO previous_allowed
  FROM public.staff_permission_overrides
  WHERE user_id = p_user_id AND permission_code = p_permission_code;

  IF p_allowed IS NULL THEN
    DELETE FROM public.staff_permission_overrides
    WHERE user_id = p_user_id AND permission_code = p_permission_code;
  ELSE
    INSERT INTO public.staff_permission_overrides (
      user_id, permission_code, allowed, changed_by, changed_at
    )
    VALUES (p_user_id, p_permission_code, p_allowed, auth.uid(), now())
    ON CONFLICT (user_id, permission_code) DO UPDATE
    SET allowed = EXCLUDED.allowed,
        changed_by = EXCLUDED.changed_by,
        changed_at = EXCLUDED.changed_at;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'staff.permission_override_changed', p_user_id,
    jsonb_build_object(
      'permission_code', p_permission_code,
      'previous_override', previous_allowed,
      'new_override', p_allowed
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_staff_access(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_role text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can revoke staff access';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'staff user is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_owner
    WHERE singleton = true AND owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'the platform owner account cannot be revoked';
  END IF;

  SELECT role::text INTO previous_role
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR previous_role <> 'admin' THEN
    RAISE EXCEPTION 'target user is not an administrator';
  END IF;

  DELETE FROM public.staff_permission_overrides WHERE user_id = p_user_id;
  DELETE FROM public.staff_role_assignments WHERE user_id = p_user_id;
  UPDATE public.profiles SET role = 'client' WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'staff.access_revoked', p_user_id,
    jsonb_build_object('previous_role', previous_role)
  );
END;
$$;

-- Keep direct table access closed; all staff administration uses owner-checked RPCs.
REVOKE ALL ON TABLE
  public.platform_owner,
  public.staff_permissions,
  public.staff_role_templates,
  public.staff_role_template_permissions,
  public.staff_role_assignments,
  public.staff_permission_overrides
FROM PUBLIC, anon, authenticated;

-- Revoke and re-grant RPC execution explicitly after replacing the functions.
REVOKE ALL ON FUNCTION public.admin_list_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, user_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_professional(uuid, verification_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_platform_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_platform_settings(numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_service_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_service_category(integer, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_service_type(integer, text, text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_pricing_tier(integer, text, numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_staff_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_staff_templates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_staff_template(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_staff_permission(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_staff_access(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_professional(uuid, verification_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_service_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_service_category(integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_service_type(integer, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pricing_tier(integer, text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_staff_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_staff_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_template(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_permission(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_staff_access(uuid) TO authenticated;

-- Only the owner can mint signed URLs for staff review; professionals can still read their own files.
DROP POLICY IF EXISTS pro_verification_documents_read ON storage.objects;
CREATE POLICY pro_verification_documents_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pro-verification-documents'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.has_admin_permission('verification.review')
    )
  );

-- Direct catalog reads remain available only to staff who have catalog permission.
DROP POLICY IF EXISTS service_types_admin_read ON public.service_types;
CREATE POLICY service_types_admin_read
  ON public.service_types FOR SELECT TO authenticated
  USING (public.has_admin_permission('catalog.manage'));
