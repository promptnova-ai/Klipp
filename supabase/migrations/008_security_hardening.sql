-- Klipp security hardening: explicitly allow only user-editable profile columns.
-- Administrative, verification and calculated fields remain server-managed.
-- Safe to re-run; this migration does not change row-level ownership policies.

-- Profiles: users may edit their own contact/display information only.
revoke update on table public.profiles from public, anon, authenticated;
revoke update (role, created_at) on table public.profiles from public, anon, authenticated;
grant update (full_name, phone, avatar_url)
  on table public.profiles to authenticated;

-- Professional profiles: keep the fields required by the current app editable,
-- but never expose verification documents/status or calculated reputation fields.
revoke update on table public.pro_profiles from public, anon, authenticated;
revoke update (
  id_document_path,
  verification_status,
  verification_note,
  verification_reviewed_at,
  verification_reviewed_by,
  rating_avg,
  rating_count,
  jobs_completed
) on table public.pro_profiles from public, anon, authenticated;

grant update (
  bio,
  years_experience,
  base_sector_id,
  accepts_auto_assign,
  active,
  transport_type
) on table public.pro_profiles to authenticated;

-- The RLS policies profiles_update_own and pro_profiles_update_own remain
-- responsible for restricting these column updates to auth.uid().
