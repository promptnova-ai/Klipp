import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandScreenHeader } from '@/components/brand-screen-header';
import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import type { VerificationStatus } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type AdminSection = 'verification' | 'accounts' | 'issues' | 'configuration' | 'staff';
type StaffPermission = { code: string; description: string; sensitive: boolean; allowed: boolean; overridden: boolean };
type StaffRow = { user_id: string; email: string | null; full_name: string | null; template_key: string; is_owner: boolean; permissions: StaffPermission[] };
type StaffTemplate = { template_key: string; name: string; description: string; permissions: string[] };
type AuditEntry = { id: number; actor_email: string | null; action: string; target_email: string | null; details: Record<string, unknown>; created_at: string };
type IssueRow = { issue_id: string; booking_id: string; reporter_id: string; reporter_name: string | null; reporter_email: string | null; professional_name: string | null; category: string; description: string | null; status: 'open' | 'in_review' | 'resolved'; created_at: string; updated_at: string; resolved_at: string | null; resolution_note: string | null; booking_status: string };
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
  { key: 'issues', title: 'Incidencias' },
  { key: 'configuration', title: 'Configuración' },
  { key: 'staff', title: 'Equipo y permisos' },
];

const permissionLabels: Record<string, string> = {
  'accounts.read': 'Consultar cuentas',
  'accounts.manage_clients': 'Gestionar clientes',
  'professionals.manage': 'Gestionar profesionales',
  'verification.review': 'Revisar verificaciones',
  'bookings.read': 'Consultar reservas',
  'bookings.manage': 'Gestionar reservas',
  'support.manage': 'Atender incidencias',
  'catalog.manage': 'Gestionar servicios y tarifas',
  'finance.read': 'Consultar finanzas',
  'finance.reconcile': 'Conciliar pagos',
  'settings.operational': 'Consultar ajustes operativos',
  'staff.manage': 'Gestionar empleados',
  'audit.read': 'Consultar actividad',
};

const permissionGroups: { title: string; codes: string[] }[] = [
  { title: 'Clientes y profesionales', codes: ['accounts.read', 'accounts.manage_clients', 'professionals.manage', 'verification.review'] },
  { title: 'Operación diaria', codes: ['bookings.read', 'bookings.manage', 'support.manage', 'catalog.manage'] },
  { title: 'Finanzas', codes: ['finance.read', 'finance.reconcile'] },
  { title: 'Administración', codes: ['settings.operational', 'staff.manage', 'audit.read'] },
];

const templateHighlights: Record<string, string> = {
  support: 'Atención al cliente y consulta básica de cuentas.',
  operations: 'Gestión operativa y revisión de profesionales.',
  finance: 'Visibilidad financiera y conciliación.',
  custom: 'Empieza sin permisos y concede solo los necesarios.',
};

function permissionLabel(code: string) {
  return permissionLabels[code] ?? code;
}

export function AdminScreen() {
  const { profile, session, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>('verification');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffTemplates, setStaffTemplates] = useState<StaffTemplate[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});
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
      const canManageSupport = owner || granted.includes('support.manage');

      const [accountResult, settingsResult, serviceResult, categoryResult, tierResult, issueResult] = await Promise.all([
        canReadAccounts ? supabase.rpc('admin_list_accounts') : Promise.resolve({ data: [], error: null }),
        canReadSettings ? supabase.rpc('admin_get_platform_settings') : Promise.resolve({ data: {}, error: null }),
        canCatalog ? supabase.from('service_types').select('id, code, name, description, active, category_id').order('name') : Promise.resolve({ data: [], error: null }),
        canCatalog ? supabase.rpc('admin_list_service_categories') : Promise.resolve({ data: [], error: null }),
        canCatalog ? supabase.from('pricing_tiers').select('id, service_type_id, label, price_dop, est_minutes').order('service_type_id').order('price_dop') : Promise.resolve({ data: [], error: null }),
        canManageSupport ? supabase.rpc('admin_list_issues') : Promise.resolve({ data: [], error: null }),
      ]);
      const loadError = accountResult.error ?? settingsResult.error ?? serviceResult.error ?? categoryResult.error ?? tierResult.error ?? issueResult.error;
      if (loadError) throw loadError;

      const accountRows = (accountResult.data ?? []) as AdminAccount[];
      const serviceRows = (serviceResult.data ?? []) as ServiceRow[];
      const categoryRows = (categoryResult.data ?? []) as ServiceCategory[];
      const tierRows = (tierResult.data ?? []) as PricingTier[];
      const settings = (settingsResult.data ?? {}) as Record<string, unknown>;
      setAccounts(accountRows);
      setIssues((issueResult.data ?? []) as IssueRow[]);
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
    if (item.key === 'issues') return isSuperAdmin || permissions.includes('support.manage');
    if (item.key === 'configuration') return isSuperAdmin || permissions.includes('catalog.manage');
    return false;
  });
  const activeSection = visibleSections.some((item) => item.key === section)
    ? section
    : visibleSections[0]?.key ?? section;

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

  async function updateIssue(issue: IssueRow, status: IssueRow['status']) {
    const note = issueNotes[issue.issue_id]?.trim() ?? '';
    if (status === 'resolved' && !note) {
      setError('Añade una nota breve explicando cómo se ha resuelto la incidencia.');
      return;
    }
    await runAction(`issue:${issue.issue_id}`, async () => {
      const { error } = await supabase.rpc('admin_update_issue', {
        p_issue_id: issue.issue_id,
        p_status: status,
        p_resolution_note: status === 'resolved' ? note : null,
      });
      if (error) throw error;
    }, status === 'resolved' ? 'Incidencia resuelta y registrada.' : status === 'in_review' ? 'Incidencia asignada a revisión.' : 'Incidencia reabierta.');
    if (status === 'resolved') setIssueNotes((current) => ({ ...current, [issue.issue_id]: '' }));
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
      <BrandScreenHeader role="admin" eyebrow={isSuperAdmin ? 'ADMINISTRACIÓN · PROPIETARIO' : 'ESPACIO DE TRABAJO'} title={isSuperAdmin ? 'Panel de control' : 'Centro de operaciones'} subtitle={isSuperAdmin ? 'Gestiona el equipo, las cuentas y la operación de Klipp.' : 'Accede a las herramientas disponibles para tu puesto. Las opciones visibles dependen de tus permisos.'} />
      <View style={styles.sectionTabs}>
        {visibleSections.map((item) => (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: activeSection === item.key }} onPress={() => setSection(item.key)} style={[styles.sectionTab, activeSection === item.key && styles.sectionTabSelected]}>
            <Text style={[styles.sectionTabText, activeSection === item.key && styles.sectionTabTextSelected]}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {visibleSections.length === 0 && <Text style={styles.empty}>Tu cuenta no tiene permisos para acceder a las secciones de administración.</Text>}
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}

      {activeSection === 'staff' && isSuperAdmin && (
        <View style={styles.section}>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>ÁREA EXCLUSIVA DEL PROPIETARIO</Text>
            <Text style={styles.heroTitle}>Equipo y permisos</Text>
            <Text style={styles.body}>Controla quién puede acceder a cada área de Klipp. Los cambios se aplican al instante y quedan registrados en el historial.</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}><Text style={styles.summaryValue}>{staffRows.filter((row) => !row.is_owner).length}</Text><Text style={styles.summaryLabel}>Empleados activos</Text></View>
              <View style={styles.summaryItem}><Text style={styles.summaryValue}>{staffTemplates.length}</Text><Text style={styles.summaryLabel}>Perfiles disponibles</Text></View>
              <View style={styles.summaryItem}><Text style={styles.summaryValue}>{auditEntries.length}</Text><Text style={styles.summaryLabel}>Eventos recientes</Text></View>
            </View>
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Perfiles de acceso</Text>
            <Text style={styles.body}>Elige un punto de partida según las tareas del puesto. Puedes ajustar cada permiso después.</Text>
          </View>
          <View style={styles.templateGrid}>
            {staffTemplates.map((template) => (
              <View key={template.template_key} style={styles.templateCard}>
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.body}>{templateHighlights[template.template_key] ?? template.description}</Text>
                <Text style={styles.templateMeta}>{template.permissions.length} permisos incluidos</Text>
                <Text style={styles.permissionSummary}>{template.permissions.length ? template.permissions.map(permissionLabel).join(' · ') : 'Sin accesos por defecto'}</Text>
              </View>
            ))}
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Personal con acceso interno</Text>
            <Text style={styles.body}>Primero crea la cuenta mediante el registro habitual. Después cambia su rol a Administrador en “Cuentas y roles” y asígnale aquí el perfil adecuado.</Text>
          </View>
          {staffRows.filter((staff) => !staff.is_owner).map((staff) => (
            <View key={staff.user_id} style={styles.card}>
              <Text style={styles.cardTitle}>{staff.full_name || staff.email || 'Empleado'}</Text>
              <Text style={styles.body}>{staff.email || 'Sin correo'}</Text>
              <View style={styles.employeeHeader}><View style={styles.employeeIdentity}><Text style={styles.label}>Perfil actual</Text><Text style={styles.body}>{staff.template_key === 'custom' ? 'Acceso personalizado' : staffTemplates.find((item) => item.template_key === staff.template_key)?.name ?? staff.template_key}</Text></View><View style={styles.statusPill}><Text style={styles.statusText}>ACTIVO</Text></View></View>
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
              <Text style={styles.label}>Permisos de este empleado</Text><Text style={styles.body}>“Habilitar” concede el acceso. “Denegar” lo bloquea aunque la plantilla lo incluya. “Restablecer” vuelve al permiso de la plantilla.</Text>
              {staff.permissions.map((permission) => (
                <View key={permission.code} style={styles.permissionRow}>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionName}>{permissionLabel(permission.code)}</Text>
                    <Text style={styles.body}>{permission.description}{permission.sensitive ? ' · Requiere especial cuidado' : ''}</Text>
                    <Text style={styles.permissionCode}>{permission.overridden ? 'AJUSTE INDIVIDUAL' : 'HEREDADO DEL PERFIL'}</Text>
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
                      <Text style={styles.permissionCode}>Restablecer</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <ActionButton secondary label="Revocar acceso de empleado" disabled={busyKey === `staff-revoke:${staff.user_id}`} onPress={() => void revokeStaff(staff.user_id)} />
            </View>
          ))}
          {staffRows.filter((staff) => !staff.is_owner).length === 0 && <Text style={styles.empty}>Aún no hay empleados con rol de administrador.</Text>}
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Historial de seguridad</Text><Text style={styles.body}>Últimos 100 cambios administrativos. Revisa quién hizo cada cambio y cuándo.</Text></View>
          {auditEntries.length === 0 ? <Text style={styles.empty}>Todavía no hay acciones registradas.</Text> : auditEntries.map((entry) => (
            <View key={entry.id} style={styles.auditRow}>
              <Text style={styles.auditAction}>{entry.action.replaceAll('_', ' ')}</Text>
              <Text style={styles.body}>{entry.actor_email || 'Actor desconocido'}{entry.target_email ? ` → ${entry.target_email}` : ''}</Text>
              <Text style={styles.permissionCode}>{new Date(entry.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      {activeSection === 'issues' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incidencias comunicadas por usuarios</Text>
          <Text style={styles.body}>Revisa el motivo, consulta la reserva relacionada y actualiza el estado. Para cerrar un caso, deja constancia de la solución aplicada.</Text>
          <View style={styles.issueSummary}>
            <View style={styles.issueCount}><Text style={styles.issueCountValue}>{issues.filter((item) => item.status === 'open').length}</Text><Text style={styles.issueCountLabel}>Abiertas</Text></View>
            <View style={styles.issueCount}><Text style={styles.issueCountValue}>{issues.filter((item) => item.status === 'in_review').length}</Text><Text style={styles.issueCountLabel}>En revisión</Text></View>
            <View style={styles.issueCount}><Text style={styles.issueCountValue}>{issues.filter((item) => item.status === 'resolved').length}</Text><Text style={styles.issueCountLabel}>Resueltas</Text></View>
          </View>
          {issues.length === 0 ? <Text style={styles.empty}>No hay incidencias registradas.</Text> : issues.map((issue) => (
            <View key={issue.issue_id} style={styles.card}>
              <View style={styles.employeeHeader}>
                <Text style={styles.cardTitle}>{issue.category.replaceAll('_', ' ')}</Text>
                <View style={[styles.issueStatus, issue.status === 'resolved' && styles.issueStatusDone, issue.status === 'in_review' && styles.issueStatusReview]}>
                  <Text style={styles.issueStatusText}>{issue.status === 'open' ? 'ABIERTA' : issue.status === 'in_review' ? 'EN REVISIÓN' : 'RESUELTA'}</Text>
                </View>
              </View>
              <Text style={styles.body}>Reportada por: {issue.reporter_name || issue.reporter_email || 'Usuario'}{issue.reporter_email ? ` · ${issue.reporter_email}` : ''}</Text>
              {issue.professional_name && <Text style={styles.body}>Profesional: {issue.professional_name}</Text>}
              <Text style={styles.body}>Reserva: {issue.booking_id.slice(0, 8)} · Estado: {issue.booking_status}</Text>
              <Text style={styles.body}>{issue.description || 'El usuario no añadió una descripción.'}</Text>
              <Text style={styles.permissionCode}>Creada: {new Date(issue.created_at).toLocaleString()}</Text>
              {issue.status !== 'resolved' ? (
                <>
                  <TextInput accessibilityLabel="Nota de resolución de la incidencia" multiline onChangeText={(value) => setIssueNotes((current) => ({ ...current, [issue.issue_id]: value }))} placeholder="Describe la solución aplicada antes de cerrar el caso" style={[styles.input, styles.multiline]} value={issueNotes[issue.issue_id] ?? ''} />
                  <View style={styles.actions}>
                    {issue.status === 'open' && <ActionButton secondary label="Marcar en revisión" disabled={busyKey === `issue:${issue.issue_id}`} onPress={() => void updateIssue(issue, 'in_review')} />}
                    <ActionButton label="Resolver incidencia" disabled={busyKey === `issue:${issue.issue_id}` || !(issueNotes[issue.issue_id] ?? '').trim()} onPress={() => void updateIssue(issue, 'resolved')} />
                  </View>
                </>
              ) : (
                <View style={styles.resolutionBox}><Text style={styles.permissionName}>Solución registrada</Text><Text style={styles.body}>{issue.resolution_note}</Text><Text style={styles.permissionCode}>Resuelta: {issue.resolved_at ? new Date(issue.resolved_at).toLocaleString() : '—'}</Text><ActionButton secondary label="Reabrir incidencia" disabled={busyKey === `issue:${issue.issue_id}`} onPress={() => void updateIssue(issue, 'open')} /></View>
              )}
            </View>
          ))}
        </View>
      )}

      {activeSection === 'verification' && (
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

      {activeSection === 'accounts' && (
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

      {activeSection === 'configuration' && (
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
  page: { padding: 22, paddingTop: 28, paddingBottom: 56, gap: 20, backgroundColor: '#F6F5FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  section: { padding: 21, gap: 15, borderWidth: 1, borderColor: '#E8E2F4', borderRadius: 22, backgroundColor: '#FFFFFF', shadowColor: '#38256D', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 3 },
  sectionTitle: { color: '#27213F', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  issueSummary: { flexDirection: 'row', gap: 8 },
  issueCount: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F3F6FA', gap: 3 },
  issueCountValue: { color: KlippColors.navy, fontSize: 22, fontWeight: '800' },
  issueCountLabel: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  issueStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: '#FFF4DB' },
  issueStatusReview: { backgroundColor: '#EAF2FF' },
  issueStatusDone: { backgroundColor: '#E8F7EE' },
  issueStatusText: { color: KlippColors.slate, fontSize: 10, fontWeight: '800' },
  resolutionBox: { padding: 12, gap: 8, borderRadius: 10, backgroundColor: '#F0F8F3' },
  heroCard: { padding: 24, gap: 15, borderRadius: 24, backgroundColor: '#39266F', shadowColor: '#39266F', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 12 }, shadowRadius: 22, elevation: 6 },
  eyebrow: { color: '#B8D2FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 5 },
  summaryItem: { flex: 1, padding: 10, borderRadius: 11, backgroundColor: '#FFFFFF18', gap: 3 },
  summaryValue: { color: KlippColors.white, fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: '#D6E2F2', fontSize: 10, fontWeight: '600' },
  sectionHeading: { gap: 4, marginTop: 5 },
  templateGrid: { gap: 9 },
  templateCard: { padding: 14, gap: 7, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 13, backgroundColor: KlippColors.white },
  templateName: { color: KlippColors.navy, fontSize: 16, fontWeight: '800' },
  templateMeta: { color: KlippColors.blueDark, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  permissionSummary: { color: KlippColors.slate, fontSize: 12, lineHeight: 18 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  employeeIdentity: { flex: 1, gap: 3 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: '#E8F7EE' },
  statusText: { color: '#067647', fontSize: 10, fontWeight: '800' },
  permissionName: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  auditAction: { color: KlippColors.navy, fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTab: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#E6E0F0', backgroundColor: '#FFFFFF' },
  sectionTabSelected: { backgroundColor: '#7051C8', borderColor: '#7051C8' },
  sectionTabText: { color: KlippColors.slate, fontWeight: '600', fontSize: 13 },
  sectionTabTextSelected: { color: KlippColors.white },
  card: { padding: 18, gap: 12, borderWidth: 1, borderColor: '#EAE5F2', borderRadius: 18, backgroundColor: '#FFFFFF' },
  tierCard: { paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: KlippColors.border },
  cardTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DDD6EA', borderRadius: 12, backgroundColor: '#FFFFFF', color: '#27213F', fontSize: 14 },
  multiline: { minHeight: 70, paddingVertical: 9, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1, minWidth: 100 },
  roleOption: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 9, backgroundColor: KlippColors.white },
  roleOptionSelected: { borderColor: '#7051C8', backgroundColor: '#F1EDFA' },
  roleText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  roleTextSelected: { color: '#593DAA' },
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
  actionButton: { minHeight: 48, flex: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#7051C8' },
  actionText: { color: KlippColors.white, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  secondaryButton: { backgroundColor: '#FEECEB' },
  secondaryActionText: { color: KlippColors.danger },
  disabled: { opacity: 0.5 },
  warning: { color: '#946200', fontSize: 13, fontWeight: '600' },
  empty: { color: KlippColors.muted, fontSize: 14, paddingVertical: 8 },
  error: { color: KlippColors.danger, fontSize: 14 },
  notice: { color: '#067647', fontSize: 14 },
});
