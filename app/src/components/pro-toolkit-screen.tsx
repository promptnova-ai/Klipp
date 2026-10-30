import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { getServiceKitItems, parseProKit, type ProKitEntry, type ProKitMap } from '@/lib/pro-kit';
import { supabase } from '../../lib/supabase';

type ProServiceOption = { id: number; code: string; name: string };
type JoinedProService = { service_type_id: number; service_types: ProServiceOption | ProServiceOption[] | null };

function emptyEntry(): ProKitEntry {
  return { readyIds: [], customItems: [] };
}

export function ProToolkitScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [services, setServices] = useState<ProServiceOption[]>([]);
  const [kits, setKits] = useState<ProKitMap>({});
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [customDraft, setCustomDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('pro_services')
      .select('service_type_id, service_types(id, code, name)')
      .eq('pro_id', userId)
      .eq('active', true);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as JoinedProService[];
    const options = rows
      .map((row) => Array.isArray(row.service_types) ? row.service_types[0] : row.service_types)
      .filter((service): service is ProServiceOption => Boolean(service) && service.code !== 'masajes');
    const unique = Array.from(new Map(options.map((service) => [service.id, service])).values())
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    setServices(unique);
    setSelectedServiceId((current) => current && unique.some((service) => service.id === current) ? current : unique[0]?.id ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setKits(parseProKit(session?.user.user_metadata?.klipp_work_kit));
  }, [session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;
  const selectedKey = selectedServiceId ? String(selectedServiceId) : '';
  const entry = selectedKey ? kits[selectedKey] ?? emptyEntry() : emptyEntry();
  const baseItems = useMemo(
    () => selectedService ? getServiceKitItems(selectedService.code, selectedService.name) : [],
    [selectedService],
  );
  const customItems = entry.customItems;
  const readyIds = new Set(entry.readyIds);
  const totalItems = baseItems.length + customItems.length;
  const readyCount = baseItems.filter((item) => readyIds.has(item.id)).length + customItems.filter((item) => item.ready).length;
  const allReady = totalItems > 0 && readyCount === totalItems;

  function updateEntry(next: ProKitEntry) {
    if (!selectedKey) return;
    setNotice(null);
    setKits((current) => ({ ...current, [selectedKey]: next }));
  }

  function toggleItem(itemId: string) {
    const next = new Set(entry.readyIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    updateEntry({ ...entry, readyIds: Array.from(next) });
  }

  function toggleCustom(itemId: string) {
    updateEntry({
      ...entry,
      customItems: entry.customItems.map((item) => item.id === itemId ? { ...item, ready: !item.ready } : item),
    });
  }

  function addCustomItem() {
    const label = customDraft.trim().slice(0, 80);
    if (!label || !selectedKey) return;
    const duplicate = [...baseItems.map((item) => item.label), ...customItems.map((item) => item.label)]
      .some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate) {
      setError('Ese elemento ya está incluido en el kit.');
      return;
    }
    updateEntry({
      ...entry,
      customItems: [...entry.customItems, { id: 'custom-' + Date.now().toString(36), label, ready: false }],
    });
    setCustomDraft('');
    setError(null);
  }

  function removeCustomItem(itemId: string) {
    updateEntry({ ...entry, customItems: entry.customItems.filter((item) => item.id !== itemId) });
  }

  async function saveKit() {
    if (!session?.user) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const metadata = { ...(session.user.user_metadata ?? {}), klipp_work_kit: kits };
      const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
      if (updateError) throw updateError;
      setNotice('Tu equipo se ha guardado. Recuerda comprobarlo antes de cada salida.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos guardar tu equipo.');
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#0F987A" /><Text style={styles.body}>Cargando tu equipo...</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#0F987A" />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader role="pro" eyebrow="PREPARACIÓN DE SERVICIOS" title="Mi equipo de trabajo" subtitle="Organiza tus herramientas y productos. Klipp espera que llegues con tu propio kit." />
      <View style={styles.policyCard}>
        <View style={styles.policyIcon}><SymbolView name={{ ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' }} tintColor="#FFFFFF" size={23} /></View>
        <Text style={styles.policyTitle}>Tú llevas tus herramientas. Siempre.</Text>
        <Text style={styles.policyBody}>El profesional aporta sus equipos, utensilios, productos y consumibles. No debes depender de herramientas ni productos del cliente para realizar el trabajo.</Text>
        <View style={styles.policyRule}><SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor="#B9F0D8" size={16} /><Text style={styles.policyRuleText}>Comprueba tu kit antes de salir a cada cita.</Text></View>
      </View>
      {services.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><SymbolView name={{ ios: 'briefcase', android: 'work', web: 'work' }} tintColor="#0F987A" size={24} /></View>
          <Text style={styles.emptyTitle}>Primero configura tus servicios</Text>
          <Text style={styles.body}>Cuando selecciones las especialidades que ofreces, podrás preparar un kit específico para cada una.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(pro)/profile')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Configurar mi negocio</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.sectionHeading}>
            <View><Text style={styles.eyebrow}>TUS ESPECIALIDADES</Text><Text style={styles.sectionTitle}>Selecciona el kit que quieres revisar</Text></View>
            <View style={styles.serviceCount}><Text style={styles.serviceCountText}>{services.length}</Text></View>
          </View>
          <View style={styles.serviceChips}>
            {services.map((service) => {
              const selected = selectedServiceId === service.id;
              return (
                <Pressable key={service.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setSelectedServiceId(service.id); setCustomDraft(''); setError(null); setNotice(null); }} style={[styles.serviceChip, selected && styles.serviceChipSelected]}>
                  <Text style={[styles.serviceChipText, selected && styles.serviceChipTextSelected]}>{service.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {selectedService && (
            <>
              <View style={styles.kitSummary}>
                <View style={styles.summaryTop}>
                  <View><Text style={styles.summaryEyebrow}>ESTADO DE TU KIT</Text><Text style={styles.summaryTitle}>{readyCount} de {totalItems} elementos listos</Text></View>
                  <View style={[styles.readinessBadge, allReady && styles.readinessBadgeReady]}><Text style={[styles.readinessBadgeText, allReady && styles.readinessBadgeTextReady]}>{allReady ? 'COMPLETO' : 'PENDIENTE'}</Text></View>
                </View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: (totalItems ? readyCount / totalItems * 100 : 0) + '%' }]} /></View>
                <Text style={styles.summaryHint}>{allReady ? 'Has marcado todo el material de esta especialidad como disponible.' : 'Marca únicamente lo que realmente tienes y puedes llevar contigo.'}</Text>
              </View>
              <View style={styles.listCard}>
                <View style={styles.listHeading}>
                  <View><Text style={styles.sectionTitle}>Kit recomendado</Text><Text style={styles.body}>Lista base para {selectedService.name.toLocaleLowerCase()}.</Text></View>
                  <SymbolView name={{ ios: 'clipboard.checkmark', android: 'fact_check', web: 'fact_check' }} tintColor="#0F987A" size={22} />
                </View>
                {baseItems.map((item) => {
                  const checked = readyIds.has(item.id);
                  return (
                    <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleItem(item.id)} style={styles.kitRow}>
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#FFFFFF" size={13} />}</View>
                      <Text style={[styles.kitItemText, checked && styles.kitItemTextChecked]}>{item.label}</Text>
                      <Text style={[styles.itemStatus, checked && styles.itemStatusChecked]}>{checked ? 'LO TENGO' : 'PENDIENTE'}</Text>
                    </Pressable>
                  );
                })}
                {customItems.length > 0 && (
                  <>
                    <View style={styles.customDivider}><Text style={styles.customHeading}>Material adicional</Text></View>
                    {customItems.map((item) => (
                      <View key={item.id} style={styles.customRow}>
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.ready }} onPress={() => toggleCustom(item.id)} style={styles.customCheckRow}>
                          <View style={[styles.checkbox, item.ready && styles.checkboxChecked]}>{item.ready && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#FFFFFF" size={13} />}</View>
                          <Text style={[styles.kitItemText, item.ready && styles.kitItemTextChecked]}>{item.label}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={'Eliminar ' + item.label} onPress={() => removeCustomItem(item.id)} style={styles.removeButton}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor="#B42318" size={15} /></Pressable>
                      </View>
                    ))}
                  </>
                )}
                <View style={styles.addItemRow}>
                  <TextInput value={customDraft} onChangeText={setCustomDraft} maxLength={80} placeholder="Añadir una herramienta o producto..." placeholderTextColor="#87958E" style={styles.customInput} />
                  <Pressable accessibilityRole="button" onPress={addCustomItem} disabled={!customDraft.trim()} style={[styles.addButton, !customDraft.trim() && styles.disabled]}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#FFFFFF" size={18} /></Pressable>
                </View>
              </View>
              {!allReady && <View style={styles.warningCard}><SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} tintColor="#946200" size={17} /><Text style={styles.warningText}>Tu kit aún está incompleto. No confirmes una salida hasta disponer de todo lo necesario para este servicio.</Text></View>}
            </>
          )}
        </>
      )}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
      {services.length > 0 && <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveKit()} style={[styles.saveButton, saving && styles.disabled]}><Text style={styles.saveButtonText}>{saving ? 'Guardando equipo...' : 'Guardar mi equipo'}</Text><SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#FFFFFF" size={17} /></Pressable>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 52, gap: 17, backgroundColor: '#F3F8F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 11, backgroundColor: '#F3F8F6' },
  body: { color: '#687B73', fontSize: 12, lineHeight: 18 },
  policyCard: { padding: 21, borderRadius: 23, backgroundColor: '#123F36', gap: 10, shadowColor: '#124B3E', shadowOpacity: 0.17, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 5 },
  policyIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF20' },
  policyTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.5 },
  policyBody: { color: '#DBEEE6', fontSize: 12, lineHeight: 18 },
  policyRule: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#FFFFFF25' },
  policyRuleText: { color: '#DDF4E9', fontSize: 11, fontWeight: '800', flex: 1 },
  emptyCard: { alignItems: 'center', padding: 24, borderRadius: 21, borderWidth: 1, borderColor: '#DCECE6', backgroundColor: '#FFFFFF', gap: 10 },
  emptyIcon: { width: 55, height: 55, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F6F1' },
  emptyTitle: { color: '#173B34', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  primaryButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, borderRadius: 12, backgroundColor: '#0F987A', marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  eyebrow: { color: '#0F987A', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#173B34', fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 4, letterSpacing: -0.4 },
  serviceCount: { minWidth: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E2F4EC' },
  serviceCountText: { color: '#087A63', fontSize: 12, fontWeight: '900' },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: '#DCECE6', backgroundColor: '#FFFFFF' },
  serviceChipSelected: { borderColor: '#0F987A', backgroundColor: '#E8F6F1' },
  serviceChipText: { color: '#60736B', fontSize: 11, fontWeight: '800' },
  serviceChipTextSelected: { color: '#087A63' },
  kitSummary: { padding: 17, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 19, backgroundColor: '#FFFFFF', gap: 10 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryEyebrow: { color: '#8A9992', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  summaryTitle: { color: '#173B34', fontSize: 16, fontWeight: '900', marginTop: 3 },
  readinessBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF5D9' },
  readinessBadgeReady: { backgroundColor: '#E8F6F1' },
  readinessBadgeText: { color: '#946200', fontSize: 8, fontWeight: '900' },
  readinessBadgeTextReady: { color: '#087A63' },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: '#E9F0EC', overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 999, backgroundColor: '#0F987A' },
  summaryHint: { color: '#7C8B84', fontSize: 10, lineHeight: 15 },
  listCard: { padding: 18, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 21, backgroundColor: '#FFFFFF', gap: 12 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
  kitRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#EEF3F0' },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: '#B8C8C0', backgroundColor: '#FFFFFF' },
  checkboxChecked: { borderColor: '#0F987A', backgroundColor: '#0F987A' },
  kitItemText: { flex: 1, color: '#41584D', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  kitItemTextChecked: { color: '#087A63' },
  itemStatus: { color: '#A38A58', fontSize: 7, fontWeight: '900', letterSpacing: 0.4 },
  itemStatusChecked: { color: '#0F987A' },
  customDivider: { paddingTop: 7, borderTopWidth: 1, borderTopColor: '#E8F0EB' },
  customHeading: { color: '#173B34', fontSize: 11, fontWeight: '900' },
  customRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEF3F0' },
  customCheckRow: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  removeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFF2F1' },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  customInput: { flex: 1, minHeight: 45, paddingHorizontal: 12, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 12, color: '#173B34', fontSize: 12 },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0F987A' },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, backgroundColor: '#FFF7E5', borderWidth: 1, borderColor: '#F2E4BD' },
  warningText: { flex: 1, color: '#765515', fontSize: 11, lineHeight: 17, fontWeight: '600' },
  error: { color: '#B42318', fontSize: 12, lineHeight: 18 },
  notice: { color: '#087A63', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  saveButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, backgroundColor: '#0F987A' },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
