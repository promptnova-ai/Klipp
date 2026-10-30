-- Klipp security hardening: allow-list profile UPDATE privileges.
-- Removes both table-level and column-level UPDATE grants from client-facing
-- roles, including any grants inherited through PUBLIC.
-- service_role and postgres privileges are intentionally untouched.

do $$
declare
  v_table text;
  v_column text;
begin
  foreach v_table in array array['profiles', 'pro_profiles'] loop
    -- Remove table-level UPDATE privileges first.
    execute format(
      'revoke update on table public.%I from PUBLIC, anon, authenticated',
      v_table
    );

    -- Also remove every historical column-level UPDATE grant. A table-level
    -- REVOKE does not remove independently granted column privileges.
    for v_column in
      select c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
    loop
      execute format(
        'revoke update (%I) on table public.%I from PUBLIC, anon, authenticated',
        v_column,
        v_table
      );
    end loop;
  end loop;
end
$$;

-- Re-grant only fields currently updated directly by the mobile app.
-- RLS owner policies still determine WHICH row can be updated.
grant update (full_name, phone, avatar_url)
  on table public.profiles to authenticated;

grant update (bio, years_experience, transport_type)
  on table public.pro_profiles to authenticated;

-- Roles, ownership IDs, verification/document fields, service-area fields,
-- availability flags, and calculated reputation counters remain server-managed.
