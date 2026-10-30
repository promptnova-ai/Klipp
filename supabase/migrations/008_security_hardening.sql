-- Klipp security hardening: explicitly allow only user-editable profile columns.
-- Administrative, verification and calculated fields remain server-managed.
-- Safe to re-run; this migration does not change row-level ownership policies.

-- Profiles: users may edit their own contact/display information only.
-- Revoke table-level AND any historical column-level grants before re-granting.
revoke update on table public.profiles from public, anon, authenticated;
revoke update (full_name, phone, avatar_url, role, created_at)
  on table public.profiles from public, anon, authenticated;
grant update (full_name, phone, avatar_url)
  on table public.profiles to authenticated;

-- Professional profiles: revoke the column-level grants issued by earlier
-- migrations (including transport_type from migration 004) before rebuilding
-- the allow-list. Table-level REVOKE alone does not remove column grants.
revoke update on table public.pro_profiles from public, anon, authenticated;
revoke update (
  bio,
  years_experience,
  base_sector_id,
  accepts_auto_assign,
  active,
  id_document_path,
  transport_type,
  verification_status,
  verification_note,
  verification_reviewed_at,
  verification_reviewed_by,
  rating_avg,
  rating_count,
  jobs_completed
) on table public.pro_profiles from public, anon, authenticated;

-- These are the only pro-profile fields the app currently needs users to edit.
grant update (
  bio,
  years_experience,
  base_sector_id,
  accepts_auto_assign,
  active,
  transport_type
) on table public.pro_profiles to authenticated;

-- Existing RLS policies profiles_update_own and pro_profiles_update_own
-- continue to restrict permitted column updates to the authenticated owner.
