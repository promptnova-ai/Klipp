import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandScreenHeader } from '@/components/brand-screen-header';
import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import type { VerificationStatus } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type AdminSection = 'verification' | 'accounts' | 'configuration' | 'staff';
type StaffPermission = { code: string; description: string; sensitive: boolean; allowed: boolean; overridden: boolean };
type StaffRow = { user_id: string; email: string | null; full_name: string | null; template_key: string; is_owner: boolean; permissions: StaffPermission[] };
type StaffTemplate = { template_key: string; name: string; description: string; permissions: string[] };
type AuditEntry = { id: number; actor_email: string | null; action: string; target_email: string | null; details: Record<string, unknown>; created_at: string };
type AdminAccount = {
  user_id: string;
  email: string | null;
  email_verified: boolean;
  full_name: string | null;
  phone: string | null;
  role: 'client' | 'pro' | 'admin';
  created_at: string;
  verification_status: VerificationStatus | null;
  id_document_path: string | null;
  verification_note: string | null;
  verification_reviewed_at: string | null;
};
type ServiceRow = {
  id: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  category_id: number | null;
};
type PricingTier = { id: number; service_type_id: number; label: string; price_dop: number; est_minutes: number };
type ServiceCategory = { id: number; name: string; description: string; active: boolean };
type CategoryDraft = Pick<ServiceCategory, 'name' | 'description' | 'active'>;
type ServiceDraft = Pick<ServiceRow, 'name' | 'description' | 'active' | 'category_id'>;
type TierDraft = Pick<PricingTier, 'label' | 'price_dop' | 'est_minutes'>;

const sections: { key: AdminSection; title: string }[] = [
  { key: 'verification', title: 'Verificaciones' },
  { key: 'accounts', title: 'Cuentas y roles' },
  { key: 'configuration', title: 'Configuración' },
  { key: 'staff', title: 'Equipo y permisos' },
];

export function AdminScreen() {
  const { profile, session, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>('verification');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffTemplates, setStaffTemplates] = useState<StaffTemplate[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [serviceDrafts, setServiceDrafts] = useState<Record<number, ServiceDraft>>({});
  const [tierDrafts, setTierDrafts] = useState<Record<number, TierDraft>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, CategoryDraft>>({});
  const [commissionPct, setCommissionPct] = useState('20');
  const [requestExpiryMinutes, setRequestExpiryMinutes] = useState('120');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    setError(null);
    try {
      const ownerResult = await supabase.rpc('is_super_admin');
      if (ownerResult.error) throw ownerResult.error;
      const owner = Boolean(ownerResult.data);
      setIsSuperAdmin(owner);

      const permissionCodes = [
        'accounts.read', 'accounts.manage_clients', 'verification.review',
        'catalog.manage',
      ];
      const permissionResults = owner
        ? permissionCodes.map(() => ({ data: true, error: null }))
        : await Promise.all(permissionCodes.map((code) =>
            supabase.rpc('has_admin_permission', { p_permission_code: code }),
          ));
      const granted = permissionCodes.filter((_, index) => Boolean(permissionResults[index].data));
      setPermissions(granted);

      const canReadAccounts = owner || granted.includes('accounts.read') || granted.includes('verification.review');
      const canCatalog = owner || granted.includes('catalog.manage');
      const canReadSettings = owner;

      const [accountResult, settingsResult, serviceResult, categoryResult, tierResult] = await Promise.all([
        canReadAccounts ? supabase.rpc('admin_list_accounts') : Promise.resolve({ data: [], error: null }),
        canReadSettings ? supabase.rpc('admin_get_platform_settings') : Promise.resolve({ data: {}, error: null }),
        canCatalog ? supabase.from('service_types').select('id, code, name, description, active, category_id').order('name') : Promise.resolve({ data: [], error: null }),
        canCatalog ? supabase.rpc('admin_list_service_categories') : Promise.resolve({ data: [], error: null }),
        canCatalog ? supabase.from('pricing_tiers').select('id, service_type_id, label, price_dop, est_minutes').order('service_type_id').order('price_dop') : Promise.resolve({ data: [], error: null }),
      ]);
      const loadError = accountResult.error ?? settingsResult.error ?? serviceResult.error ?? categoryResult.error ?? tierResult.error;
      if (loadError) throw loadError;

      const accountRows = (accountResult.data ?? []) as AdminAccount[];
      const serviceRows = (serviceResult.data ?? []) as ServiceRow[];
      const categoryRows = (categoryResult.data ?? []) as ServiceCategory[];
      const tierRows = (tierResult.data ?? []) as PricingTier[];
      const settings = (settingsResult.data ?? {}) as Record<string, unknown>;
      setAccounts(accountRows);
      setServices(serviceRows);
      setCategories(categoryRows);
      setTiers(tierRows);
      setServiceDrafts(Object.fromEntries(serviceRows.map((service) => [service.id, {
        name: service.name, description: service.description, active: service.active, category_id: service.category_id,
      }])));
      setTierDrafts(Object.fromEntries(tierRows.map((tier) => [tier.id, {
        label: tier.label, price_dop: tier.price_dop, est_minutes: tier.est_minutes,
      }])));
      setCategoryDrafts(Object.fromEntries(categoryRows.map((category) => [category.id, {
        name: category.name, description: category.description, active: category.active,
      }])));
      const commission = Number(settings.commission_pct);
      const expiry = Number(settings.request_expiry_minutes);
      if (Number.isFinite(commission)) setCommissionPct(String(commission));
      if (Number.isInteger(expiry)) setRequestExpiryMinutes(String(expiry));

      if (owner) {
        const [staffResult, templatesResult, auditResult] = await Promise.all([
          supabase.rpc('admin_list_staff_access'),
          supabase.rpc('admin_list_staff_templates'),
          supabase.rpc('admin_list_audit_log', { p_limit: 100 }),
        ]);
        if (staffResult.error) throw staffResult.error;
        if (templatesResult.error) throw templatesResult.error;
        if (auditResult.error) throw auditResult.error;
        setStaffRows((staffResult.data ?? []) as StaffRow[]);
        setStaffTemplates((templatesResult.data ?? []) as StaffTemplate[]);
        setAuditEntries((auditResult.data ?? []) as AuditEntry[]);
      } else {
        setStaffRows([]);
        setStaffTemplates([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar el panel.');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const pendingProfessionals = useMemo(
    () => accounts.filter((account) => account.role === 'pro' && account.verification_status !== 'approved'),
    [accounts],
  );
  const canManageAccounts = isSuperAdmin || permissions.includes('accounts.manage_clients');
  const canReviewProfessionals = isSuperAdmin || permissions.includes('verification.review');
  const visibleSections = sections.filter((item) => {
    if (item.key === 'staff') return isSuperAdmin;
    if (item.key === 'verification') return isSuperAdmin || permissions.includes('verification.review');
    if (item.key === 'accounts') return isSuperAdmin || permissions.includes('accounts.read');
    if (item.key === 'configuration') return isSuperAdmin || permissions.includes('catalog.manage');
    return false;
  });
  useEffect(() => {
    if (visibleSections.length > 0 && !visibleSections.some((item) => item.key === section)) {
      setSection(visibleSections[0].key);
    }
  }, [visibleSections, section]);

  const filteredAccounts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return normalized
      ? accounts.filter((account) => `${account.full_name ?? ''} ${account.email ?? ''} ${account.phone ?? ''}`.toLocaleLowerCase().includes(normalized))
      : accounts;
  }, [accounts, search]);

  async function runAction(key: string, action: () => Promise<void>, successMessage: string) {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos completar la acción.');
    } finally {
      setBusyKey(null);
    }
  }

  async function openVerificationDocument(path: string) {
    await runAction(`document:${path}`, async () => {
      const { data, error: signedUrlError } = await supabase.storage
        .from('pro-verification-documents')
        .createSignedUrl(path, 60);
      if (signedUrlError) throw signedUrlError;
      if (!data?.signedUrl) throw new Error('No se pudo generar el enlace privado del documento.');
      await Linking.openURL(data.signedUrl);
    }, 'Documento abierto en una ventana segura.');
  }

  async function reviewProfessional(account: AdminAccount, status: 'approved' | 'rejected') {
    const note = reviewNotes[account.user_id]?.trim() ?? '';
    await runAction(`review:${account.user_id}`, async () => {
      const { error: reviewError } = await supabase.rpc('admin_review_professional', {
        p_pro_id: account.user_id,
        p_status: status,
        p_note: note || null,
      });
      if (reviewError) throw reviewError;
    }, status === 'approved' ? 'Perfil profesional aprobado.' : 'Verificación rechazada con el motivo indicado.');
  }

  async function changeRole(account: AdminAccount, role: AdminAccount['role']) {
    if (account.user_id === profile?.id || role === account.role) return;
    if (role === 'admin' && !isSuperAdmin) return;
    await runAction(`role:${account.user_id}`, async () => {
      const { error: roleError } = await supabase.rpc('admin_set_user_role', {
        p_user_id: account.user_id,
        p_role: role,
      });
      if (roleError) throw roleError;
    }, `Rol actualizado a ${role}.`);
  }

  async function saveSettings() {
    if (!isSuperAdmin) { setError('Solo el superadministrador puede modificar parámetros críticos.'); return; }
    const commission = Number(commissionPct);
    const expiry = Number(requestExpiryMinutes);
    if (!Number.isFinite(commission) || commission < 0 || commission > 50) {
      setError('La comisión debe estar entre 0 y 50%.');
      return;
    }
    if (!Number.isInteger(expiry) || expiry < 15 || expiry > 1440) {
      setError('El vencimiento debe estar entre 15 y 1440 minutos.');
      return;
    }
    Alert.alert('Actualizar parámetros críticos', 'La comisión y el vencimiento afectan a las nuevas operaciones de Klipp. ¿Confirmas los cambios?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar cambios', style: 'destructive', onPress: () => {
        void runAction('settings', async () => {
          const { error: settingsError } = await supabase.rpc('admin_update_platform_settings', {
            p_commission_pct: commission,
            p_request_expiry_minutes: expiry,
          });
          if (settingsError) throw settingsError;
        }, 'Parámetros críticos guardados.');
      } },
    ]);
  }

  async function saveService(service: ServiceRow) {
    const draft = serviceDrafts[service.id];
    if (!draft) return;
    await runAction(`service:${service.id}`, async () => {
      const { error: serviceError } = await supabase.rpc('admin_update_service_type', {
        p_service_type_id: service.id,
        p_name: draft.name,
        p_description: draft.description,
        p_active: draft.active,
        p_category_id: draft.category_id,
      });
      if (serviceError) throw serviceError;
    }, `Servicio “${draft.name}” guardado.`);
  }

  async function saveTier(tier: PricingTier) {
    const draft = tierDrafts[tier.id];
    if (!draft) return;
    const price = Number(draft.price_dop);
    const duration = Number(draft.est_minutes);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(duration)) {
      setError('Indica un precio y una duración válidos para cada tarifa.');
      return;
    }
    await runAction(`tier:${tier.id}`, async () => {
      const { error: tierError } = await supabase.rpc('admin_update_pricing_tier', {
        p_tier_id: tier.id,
        p_label: draft.label,
        p_price_dop: price,
        p_est_minutes: duration,
      });
      if (tierError) throw tierError;
    }, 'Tarifa guardada.');
  }

  async function saveCategory(category: ServiceCategory) {
    const draft = categoryDrafts[category.id];
    if (!draft) return;
    await runAction(`category:${category.id}`, async () => {
      const { error: categoryError } = await supabase.rpc('admin_update_service_category', {
        p_category_id: category.id,
        p_name: draft.name,
        p_description: draft.description,
        p_active: draft.active,
      });
      if (categoryError) throw categoryError;
    }, `Categoría “${draft.name}” guardada.`);
  }

  async function assignStaffTemplate(userId: string, templateKey: string) {
    await runAction(`staff-template:${userId}`, async () => {
      const { error } = await supabase.rpc('admin_set_staff_template', { p_user_id: userId, p_template_key: templateKey });
      if (error) throw error;
    }, 'Plantilla de permisos actualizada.');
  }

  async function setStaffPermission(userId: string, permissionCode: string, allowed: boolean | null) {
    await runAction(`staff-permission:${userId}:${permissionCode}`, async () => {
      const { error } = await supabase.rpc('admin_set_staff_permission', {
        p_user_id: userId, p_permission_code: permissionCode, p_allowed: allowed,
      });
      if (error) throw error;
    }, 'Permiso individual actualizado.');
  }

  async function revokeStaff(userId: string) {
    Alert.alert('Revocar acceso', 'Esta persona perderá inmediatamente el acceso de administrador y volverá al rol de cliente. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Revocar acceso', style: 'destructive', onPress: () => {
        void runAction(`staff-revoke:${userId}`, async () => {
          const { error } = await supabase.rpc('admin_revoke_staff_access', { p_user_id: userId });
          if (error) throw error;
        }, 'Acceso de administrador revocado.');
      } },
    ]);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.body}>Cargando administración...</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="ADMINISTRACIÓN" title="Panel de control" subtitle="Gestiona verificaciones, cuentas y parámetros de Klipp." />
      <View style={styles.sectionTabs}>
        {visibleSections.map((item) => (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: section === item.key }} onPress={() => setSection(item.key)} style={[styles.sectionTab, section === item.key && styles.sectionTabSelected]}>
            <Text style={[styles.sectionTabText, section === item.key && styles.sectionTabTextSelected]}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {visibleSections.length === 0 && <Text style={styles.empty}>Tu cuenta no tiene permisos para acceder a las secciones de administración.</Text>}
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

      {section === 'staff' && isSuperAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Centro de control del propietario</Text>
          <Text style={styles.body}>Solo tú puedes administrar empleados y permisos. Los cambios se aplican en el servidor y quedan registrados.</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Niveles de acceso</Text>
            {staffTemplates.map((template) => (
              <View key={template.template_key} style={styles.tierCard}>
                <Text style={styles.label}>{template.name}</Text>
                <Text style={styles.body}>{template.description}</Text>
                <Text style={styles.body}>{template.permissions.length ? template.permissions.join(' · ') : 'Sin permisos predeterminados'}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Administradores y empleados</Text>
          <Text style={styles.body}>Para incorporar a alguien, primero debe registrarse en Klipp y después debes asignarle el rol de administrador desde Cuentas y roles.</Text>
          {staffRows.filter((staff) => !staff.is_owner).map((staff) => (
            <View key={staff.user_id} style={styles.card}>
              <Text style={styles.cardTitle}>{staff.full_name || staff.email || 'Empleado'}</Text>
              <Text style={styles.body}>{staff.email || 'Sin correo'}</Text>
              <Text style={styles.label}>Plantilla de acceso</Text>
              <View style={styles.actions}>
                {staffTemplates.map((template) => (
                  <Pressable key={template.template_key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: staff.template_key === template.template_key }}
                    onPress={() => void assignStaffTemplate(staff.user_id, template.template_key)}
                    disabled={busyKey === `staff-template:${staff.user_id}`}
                    style={[styles.roleOption, staff.template_key === template.template_key && styles.roleOptionSelected]}>
                    <Text style={[styles.roleText, staff.template_key === template.template_key && styles.roleTextSelected]}>{template.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Permisos personalizados</Text>
              {staff.permissions.map((permission) => (
                <View key={permission.code} style={styles.permissionRow}>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.body}>{permission.description}{permission.sensitive ? ' · Sensible' : ''}</Text>
                    <Text style={styles.permissionCode}>{permission.code} · {permission.overridden ? 'Personalizado' : 'Plantilla'}</Text>
                  </View>
                  <View style={styles.permissionActions}>
                    <Pressable accessibilityRole="button" onPress={() => void setStaffPermission(staff.user_id, permission.code, true)}
                      disabled={busyKey === `staff-permission:${staff.user_id}:${permission.code}`}
                      style={[styles.permissionToggle, permission.allowed && styles.permissionToggleActive]}>
                      <Text style={[styles.permissionToggleText, permission.allowed && styles.permissionToggleTextActive]}>Sí</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => void setStaffPermission(staff.user_id, permission.code, false)}
                      disabled={busyKey === `staff-permission:${staff.user_id}:${permission.code}`}
                      style={[styles.permissionToggle, !permission.allowed && styles.permissionToggleDenied]}>
                      <Text style={[styles.permissionToggleText, !permission.allowed && styles.permissionToggleTextDenied]}>No</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => void setStaffPermission(staff.user_id, permission.code, null)}
                      disabled={!permission.overridden || busyKey === `staff-permission:${staff.user_id}:${permission.code}`}
                      style={[styles.permissionReset, !permission.overridden && styles.disabled]}>
                      <Text style={styles.permissionCode}>Reset</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <ActionButton secondary label="Revocar acceso de empleado" disabled={busyKey === `staff-revoke:${staff.user_id}`} onPress={() => void revokeStaff(staff.user_id)} />
            </View>
          ))}
          {staffRows.filter((staff) => !staff.is_owner).length === 0 && <Text style={styles.empty}>Aún no hay empleados con rol de administrador.</Text>}
          <Text style={styles.sectionTitle}>Registro de actividad</Text>
          <Text style={styles.body}>Últimas 100 acciones administrativas. Solo visible para el propietario.</Text>
          {auditEntries.length === 0 ? <Text style={styles.empty}>Todavía no hay acciones registradas.</Text> : auditEntries.map((entry) => (
            <View key={entry.id} style={styles.auditRow}>
              <Text style={styles.label}>{entry.action}</Text>
              <Text style={styles.body}>{entry.actor_email || 'Actor desconocido'}{entry.target_email ? ` → ${entry.target_email}` : ''}</Text>
              <Text style={styles.permissionCode}>{new Date(entry.created_at).toLocaleString()}</Text>
              <Text style={styles.permissionCode}>{JSON.stringify(entry.details)}</Text>
            </View>
          ))}
        </View>
      )}

      {section === 'verification' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revisión de profesionales</Text>
          <Text style={styles.body}>Los documentos de identidad son privados. Los enlaces firmados caducan en 60 segundos.</Text>
          {pendingProfessionals.length === 0 ? <Text style={styles.empty}>No hay profesionales pendientes de revisión.</Text> : pendingProfessionals.map((account) => (
            <View key={account.user_id} style={styles.card}>
              <Text style={styles.cardTitle}>{account.full_name || 'Profesional sin nombre'}</Text>
              <Text style={styles.body}>{account.email || 'Sin correo'} · {account.verification_status === 'rejected' ? 'Rechazada' : 'Pendiente'}</Text>
              <Text style={account.email_verified ? styles.notice : styles.warning}>{account.email_verified ? 'Correo confirmado' : 'Correo sin confirmar'}</Text>
              {account.verification_note && <Text style={styles.body}>Motivo anterior: {account.verification_note}</Text>}
              {account.id_document_path ? (
                <ActionButton
                  disabled={busyKey === `document:${account.id_document_path}`}
                  label={busyKey === `document:${account.id_document_path}` ? 'Abriendo...' : 'Ver documento privado'}
                  onPress={() => void openVerificationDocument(account.id_document_path!)}
                />
              ) : <Text style={styles.warning}>Aún no ha subido documento.</Text>}
              <TextInput
                accessibilityLabel={`Motivo para ${account.full_name ?? account.email ?? 'profesional'}`}
                onChangeText={(value) => setReviewNotes((current) => ({ ...current, [account.user_id]: value }))}
                placeholder="Motivo de rechazo (obligatorio al rechazar)"
                style={styles.input}
                value={reviewNotes[account.user_id] ?? ''}
              />
              <View style={styles.actions}>
                <ActionButton disabled={!canReviewProfessionals || busyKey === `review:${account.user_id}` || !account.id_document_path} label="Aprobar" onPress={() => void reviewProfessional(account, 'approved')} />
                <ActionButton disabled={!canReviewProfessionals || busyKey === `review:${account.user_id}`} label="Rechazar" onPress={() => void reviewProfessional(account, 'rejected')} secondary />
              </View>
            </View>
          ))}
        </View>
      )}

      {section === 'accounts' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuentas y roles</Text>
          <Text style={styles.body}>Crea las cuentas desde el registro habitual. El rol de administrador solo puede asignarlo el superadministrador; el empleado recibirá inicialmente permisos personalizados sin accesos concedidos.</Text>
          <TextInput accessibilityLabel="Buscar cuentas" onChangeText={setSearch} placeholder="Buscar por nombre, correo o teléfono" style={styles.input} value={search} />
          {filteredAccounts.map((account) => (
            <View key={account.user_id} style={styles.card}>
              <Text style={styles.cardTitle}>{account.full_name || 'Cuenta sin nombre'}</Text>
              <Text style={styles.body}>{account.email || 'Sin correo'}{account.phone ? ` · ${account.phone}` : ''}</Text>
              <Text style={styles.label}>{account.role === 'admin' ? 'Administrador' : account.role === 'pro' ? 'Profesional' : 'Cliente'}</Text>
              <View style={styles.actions}>
                {(['client', 'pro', ...(isSuperAdmin ? ['admin' as const] : [])] as const).map((role) => (
                  <Pressable
                    key={role}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: account.role === role, disabled: account.user_id === profile?.id }}
                    disabled={account.user_id === profile?.id || (!canManageAccounts && role !== 'admin') || busyKey === `role:${account.user_id}`}
                    onPress={() => void changeRole(account, role)}
                    style={[styles.roleOption, account.role === role && styles.roleOptionSelected, account.user_id === profile?.id && styles.disabled]}>
                    <Text style={[styles.roleText, account.role === role && styles.roleTextSelected]}>{role}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {section === 'configuration' && (
        <>
          {isSuperAdmin && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parámetros críticos · solo propietario</Text>
            <Text style={styles.body}>Estos valores se aplican al crear nuevas reservas y solicitudes profesionales.</Text>
            <Text style={styles.label}>Comisión de Klipp (%) · máximo 50</Text>
            <TextInput keyboardType="decimal-pad" onChangeText={setCommissionPct} style={styles.input} value={commissionPct} />
            <Text style={styles.label}>Vencimiento de una solicitud (minutos)</Text>
            <TextInput keyboardType="number-pad" onChangeText={setRequestExpiryMinutes} style={styles.input} value={requestExpiryMinutes} />
            <ActionButton disabled={busyKey === 'settings'} label={busyKey === 'settings' ? 'Guardando...' : 'Guardar parámetros'} onPress={() => void saveSettings()} />
          </View>}
          {(isSuperAdmin || permissions.includes('catalog.manage')) && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Catálogo y tarifas</Text>
            <Text style={styles.label}>Categorías</Text>
            {categories.map((category) => {
              const draft = categoryDrafts[category.id];
              if (!draft) return null;
              return (
                <View key={category.id} style={styles.card}>
                  <TextInput accessibilityLabel={`Nombre de categoría ${category.name}`} onChangeText={(name) => setCategoryDrafts((current) => ({ ...current, [category.id]: { ...draft, name } }))} style={styles.input} value={draft.name} />
                  <TextInput accessibilityLabel={`Descripción de categoría ${category.name}`} onChangeText={(description) => setCategoryDrafts((current) => ({ ...current, [category.id]: { ...draft, description } }))} style={styles.input} value={draft.description} />
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.active }} onPress={() => setCategoryDrafts((current) => ({ ...current, [category.id]: { ...draft, active: !draft.active } }))} style={styles.roleOption}>
                    <Text style={styles.body}>{draft.active ? '✓ Categoría activa' : 'Categoría desactivada'}</Text>
                  </Pressable>
                  <ActionButton disabled={busyKey === `category:${category.id}`} label="Guardar categoría" onPress={() => void saveCategory(category)} secondary />
                </View>
              );
            })}
            {services.map((service) => {
              const draft = serviceDrafts[service.id];
              if (!draft) return null;
              return (
                <View key={service.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{service.code}</Text>
                  <TextInput accessibilityLabel={`Nombre de ${service.name}`} onChangeText={(name) => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, name } }))} style={styles.input} value={draft.name} />
                  <TextInput accessibilityLabel={`Descripción de ${service.name}`} multiline onChangeText={(description) => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, description } }))} style={[styles.input, styles.multiline]} value={draft.description} />
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.active }} onPress={() => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, active: !draft.active } }))} style={styles.roleOption}>
                    <Text style={styles.body}>{draft.active ? '✓ Servicio publicado' : 'Servicio desactivado'}</Text>
                  </Pressable>
                  <Text style={styles.label}>Categoría</Text>
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="radio" accessibilityState={{ selected: draft.category_id === null }} onPress={() => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, category_id: null } }))} style={[styles.roleOption, draft.category_id === null && styles.roleOptionSelected]}>
                      <Text style={[styles.roleText, draft.category_id === null && styles.roleTextSelected]}>Sin categoría</Text>
                    </Pressable>
                    {categories.filter((category) => category.active || category.id === draft.category_id).map((category) => (
                      <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ selected: draft.category_id === category.id }} onPress={() => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, category_id: category.id } }))} style={[styles.roleOption, draft.category_id === category.id && styles.roleOptionSelected]}>
                        <Text style={[styles.roleText, draft.category_id === category.id && styles.roleTextSelected]}>{category.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <ActionButton disabled={busyKey === `service:${service.id}`} label="Guardar servicio" onPress={() => void saveService(service)} />
                  {tiers.filter((tier) => tier.service_type_id === service.id).map((tier) => {
                    const tierDraft = tierDrafts[tier.id];
                    if (!tierDraft) return null;
                    return (
                      <View key={tier.id} style={styles.tierCard}>
                        <TextInput accessibilityLabel={`Etiqueta de tarifa ${tier.id}`} onChangeText={(label) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...tierDraft, label } }))} style={styles.input} value={tierDraft.label} />
                        <View style={styles.actions}>
                          <TextInput accessibilityLabel={`Precio de tarifa ${tier.id}`} keyboardType="decimal-pad" onChangeText={(value) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...tierDraft, price_dop: Number(value) } }))} style={[styles.input, styles.flex]} value={String(tierDraft.price_dop)} />
                          <TextInput accessibilityLabel={`Duración de tarifa ${tier.id}`} keyboardType="number-pad" onChangeText={(value) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...tierDraft, est_minutes: Number(value) } }))} style={[styles.input, styles.flex]} value={String(tierDraft.est_minutes)} />
                        </View>
                        <ActionButton disabled={busyKey === `tier:${tier.id}`} label="Guardar tarifa" onPress={() => void saveTier(tier)} secondary />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>}
        </>
      )}
      <ActionButton label="Cerrar sesión de administrador" onPress={() => void signOut()} secondary />
    </ScrollView>
  );
}

function ActionButton({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 44, gap: 16, backgroundColor: KlippColors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  section: { padding: 17, gap: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700' },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTab: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  sectionTabSelected: { backgroundColor: KlippColors.navy, borderColor: KlippColors.navy },
  sectionTabText: { color: KlippColors.slate, fontWeight: '600', fontSize: 13 },
  sectionTabTextSelected: { color: KlippColors.white },
  card: { padding: 13, gap: 10, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: '#FCFCFD' },
  tierCard: { paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: KlippColors.border },
  cardTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 9, backgroundColor: KlippColors.white, color: KlippColors.navy, fontSize: 14 },
  multiline: { minHeight: 70, paddingVertical: 9, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1, minWidth: 100 },
  roleOption: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 9, backgroundColor: KlippColors.white },
  roleOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  roleText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  roleTextSelected: { color: KlippColors.blueDark },
  auditRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 4 },
  permissionRow: { flexDirection: 'column', gap: 7, paddingVertical: 9, borderTopWidth: 1, borderTopColor: KlippColors.border },
  permissionCopy: { gap: 2 },
  permissionCode: { color: KlippColors.muted, fontSize: 11 },
  permissionActions: { flexDirection: 'row', gap: 6 },
  permissionToggle: { minWidth: 48, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8 },
  permissionToggleActive: { backgroundColor: '#E8F7EE', borderColor: '#16A34A' },
  permissionToggleDenied: { backgroundColor: '#FEECEB', borderColor: KlippColors.danger },
  permissionToggleText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  permissionToggleTextActive: { color: '#067647' },
  permissionToggleTextDenied: { color: KlippColors.danger },
  permissionReset: { minWidth: 54, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  actionButton: { minHeight: 42, flex: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: KlippColors.blue },
  actionText: { color: KlippColors.white, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  secondaryButton: { backgroundColor: '#FEECEB' },
  secondaryActionText: { color: KlippColors.danger },
  disabled: { opacity: 0.5 },
  warning: { color: '#946200', fontSize: 13, fontWeight: '600' },
  empty: { color: KlippColors.muted, fontSize: 14, paddingVertical: 8 },
  error: { color: KlippColors.danger, fontSize: 14 },
  notice: { color: '#067647', fontSize: 14 },
});
