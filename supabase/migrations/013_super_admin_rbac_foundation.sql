-- Klipp Phase 1: single-owner super-admin and staff RBAC foundation.
-- This migration is intentionally NOT executed by this change.
-- Owner bootstrap is bound to the existing admin@admin.com account and fails closed
-- if the account is missing, duplicated, or does not currently have the admin role.

DO $owner_preflight$
DECLARE
  matching_accounts integer;
  configured_owner uuid;
  existing_owner uuid;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Phase 1 aborted: public.profiles does not exist';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Phase 1 aborted: auth.users does not exist';
  END IF;

  SELECT count(*), min(u.id)
    INTO matching_accounts, configured_owner
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower('admin@admin.com')
    AND p.role::text = 'admin';

  IF matching_accounts <> 1 OR configured_owner IS NULL THEN
    RAISE EXCEPTION
      'Phase 1 aborted: expected exactly one admin profile for admin@admin.com; found %',
      matching_accounts;
  END IF;

  CREATE TABLE IF NOT EXISTS public.platform_owner (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
    owner_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
    configured_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.platform_owner (singleton, owner_user_id)
  VALUES (true, configured_owner)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT owner_user_id INTO existing_owner
  FROM public.platform_owner
  WHERE singleton = true;

  IF existing_owner IS DISTINCT FROM configured_owner THEN
    RAISE EXCEPTION
      'Phase 1 aborted: platform_owner is already bound to a different account; manual owner transfer review is required';
  END IF;
END
$owner_preflight$;

ALTER TABLE public.platform_owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_owner FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_owner owner_record
    WHERE owner_record.singleton = true
      AND owner_record.owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Preserve compatibility with existing admin RPCs while recognizing the owner.
-- Later phases will replace broad is_admin checks with permission-specific checks.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role::text = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  code text PRIMARY KEY,
  description text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_role_templates (
  template_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_role_template_permissions (
  template_key text NOT NULL REFERENCES public.staff_role_templates(template_key) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.staff_permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (template_key, permission_code)
);

CREATE TABLE IF NOT EXISTS public.staff_role_assignments (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key text NOT NULL REFERENCES public.staff_role_templates(template_key) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_permission_overrides (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.staff_permissions(code) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_template_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permission_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.staff_permissions,
  public.staff_role_templates,
  public.staff_role_template_permissions,
  public.staff_role_assignments,
  public.staff_permission_overrides
FROM PUBLIC, anon, authenticated;

INSERT INTO public.staff_permissions (code, description, sensitive) VALUES
  ('accounts.read', 'Consultar cuentas y datos básicos de usuarios', false),
  ('accounts.manage_clients', 'Gestionar cuentas de clientes', false),
  ('professionals.manage', 'Gestionar perfiles profesionales', false),
  ('verification.review', 'Revisar documentos y verificaciones profesionales', true),
  ('bookings.read', 'Consultar reservas y solicitudes', false),
  ('bookings.manage', 'Gestionar reservas, asignaciones y cancelaciones', false),
  ('support.manage', 'Gestionar incidencias y reclamaciones', false),
  ('catalog.manage', 'Gestionar categorías, servicios y tarifas', false),
  ('finance.read', 'Consultar información financiera', true),
  ('finance.reconcile', 'Realizar tareas de conciliación financiera', true),
  ('settings.operational', 'Modificar parámetros operativos no críticos', true),
  ('staff.manage', 'Gestionar empleados y asignaciones de permisos', true),
  ('audit.read', 'Consultar el registro de auditoría', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.staff_role_templates (template_key, name, description) VALUES
  ('support', 'Soporte', 'Atención al cliente, incidencias y consulta de reservas.'),
  ('operations', 'Operaciones', 'Gestión diaria de profesionales, verificaciones, reservas y catálogo.'),
  ('finance', 'Finanzas', 'Consulta y conciliación financiera sin acceso a configuración crítica.'),
  ('custom', 'Personalizado', 'Permisos asignados individualmente por el superadministrador.')
ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.staff_role_template_permissions (template_key, permission_code) VALUES
  ('support', 'accounts.read'),
  ('support', 'bookings.read'),
  ('support', 'support.manage'),
  ('operations', 'accounts.read'),
  ('operations', 'accounts.manage_clients'),
  ('operations', 'professionals.manage'),
  ('operations', 'verification.review'),
  ('operations', 'bookings.read'),
  ('operations', 'bookings.manage'),
  ('operations', 'catalog.manage'),
  ('operations', 'settings.operational'),
  ('finance', 'finance.read'),
  ('finance', 'finance.reconcile')
ON CONFLICT (template_key, permission_code) DO NOTHING;

-- Permission resolver: explicit user overrides take precedence over template grants.
CREATE OR REPLACE FUNCTION public.has_admin_permission(p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  explicit_allowed boolean;
BEGIN
  IF auth.uid() IS NULL OR p_permission_code IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role::text = 'admin'
  ) THEN
    RETURN false;
  END IF;

  SELECT override_record.allowed
    INTO explicit_allowed
  FROM public.staff_permission_overrides override_record
  WHERE override_record.user_id = auth.uid()
    AND override_record.permission_code = p_permission_code;

  IF FOUND THEN
    RETURN explicit_allowed;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.staff_role_assignments assignment
    JOIN public.staff_role_template_permissions template_permission
      ON template_permission.template_key = assignment.template_key
    WHERE assignment.user_id = auth.uid()
      AND template_permission.permission_code = p_permission_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_admin_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(text) TO authenticated;

-- Close the privilege-escalation path in the legacy role-management RPC.
-- Ordinary admins may manage client/pro account roles, but only the owner may
-- grant/revoke admin status. The owner account itself is immutable here.
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
  IF NOT public.is_admin() THEN
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

  IF (p_role::text = 'admin' OR target_role::text = 'admin')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can grant or revoke administrator access';
  END IF;

  IF p_role::text = 'pro' THEN
    INSERT INTO public.pro_profiles (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (
    auth.uid(),
    'account.role_changed',
    p_user_id,
    jsonb_build_object('role', p_role::text, 'previous_role', target_role::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, user_role) TO authenticated;
