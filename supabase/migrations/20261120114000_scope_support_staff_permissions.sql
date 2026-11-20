-- Keep the support staff role scoped to the support inbox.
-- Support agents can respond to cases and manage the approved knowledge base,
-- but do not inherit global account or booking read access by default.
delete from public.staff_role_template_permissions
where template_key = 'support'
  and permission_code in ('accounts.read', 'bookings.read');

insert into public.staff_role_template_permissions (template_key, permission_code)
select 'support', 'support.manage'
where exists (select 1 from public.staff_role_templates where template_key = 'support')
  and exists (select 1 from public.staff_permissions where code = 'support.manage')
on conflict (template_key, permission_code) do nothing;
