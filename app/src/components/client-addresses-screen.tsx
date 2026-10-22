import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { sectorCenterToEwkt } from '@/lib/geo';
import type { Address, Sector } from '@/lib/types';

type AddressWithSector = Address & { sectors: { name: string; zone: string } | null };

export function ClientAddressesScreen() {
  const { session } = useAuth();
  const [addresses, setAddresses] = useState<AddressWithSector[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [references, setReferences] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const [sectorResult, addressResult] = await Promise.all([
      supabase.from('sectors').select('id, name, zone, center, active').eq('active', true).order('name'),
      supabase.from('addresses').select('id, client_id, label, street, references_text, sector_id, location, created_at, sectors(name, zone)').eq('client_id', session.user.id).order('created_at', { ascending: false }),
    ]);
    if (sectorResult.error || addressResult.error) {
      setError(sectorResult.error?.message ?? addressResult.error?.message ?? 'No pudimos cargar tus direcciones.');
    } else {
      const sectorRows = (sectorResult.data ?? []) as Sector[];
      setSectors(sectorRows);
      setSelectedSectorId((current) => current ?? sectorRows[0]?.id ?? null);
      setAddresses((addressResult.data ?? []) as unknown as AddressWithSector[]);
    }
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadAddresses(); }, [loadAddresses]));

  async function refresh() {
    setRefreshing(true);
    await loadAddresses();
    setRefreshing(false);
  }

  async function saveAddress() {
    if (!session?.user.id || selectedSectorId === null) {
      setError('Selecciona un sector.');
      return;
    }
    if (!references.trim()) {
      setError('Escribe referencias para que el profesional pueda ubicar la dirección.');
      return;
    }
    const sector = sectors.find((item) => item.id === selectedSectorId);
    // TODO: replace the sector center with a map pin when map-based addresses are implemented.
    const location = sector ? sectorCenterToEwkt(sector.center) : null;
    if (!location) {
      setError('No pudimos interpretar el centro de este sector. Revisa el formato que devuelve sectors.center antes de guardar.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: insertError } = await supabase.from('addresses').insert({
      client_id: session.user.id,
      label: label.trim() || null,
      street: street.trim() || null,
      references_text: references.trim(),
      sector_id: selectedSectorId,
      location,
    });
    if (insertError) setError(insertError.message);
    else {
      setLabel('');
      setStreet('');
      setReferences('');
      setNotice('Dirección guardada.');
      await loadAddresses();
    }
    setSaving(false);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando direcciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="TU CUENTA" title="Mis direcciones" subtitle="Guarda los sectores donde solicitas servicios." />
      {addresses.length === 0 && <Text style={styles.body}>Todavía no has guardado una dirección.</Text>}
      {addresses.map((address) => (
        <View key={address.id} style={styles.addressCard}>
          <Text style={styles.cardTitle}>{address.label || address.sectors?.name || 'Dirección'}</Text>
          {!!address.street && <Text style={styles.body}>{address.street}</Text>}
          <Text style={styles.body}>Sector: {address.sectors?.name ?? 'No disponible'}</Text>
          <Text style={styles.body}>Referencias: {address.references_text}</Text>
        </View>
      ))}

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Añadir dirección</Text>
        <Text style={styles.label}>Nombre para identificarla</Text>
        <TextInput onChangeText={setLabel} placeholder="Casa, trabajo..." placeholderTextColor="#85918b" style={styles.input} value={label} />
        <Text style={styles.label}>Calle o dirección</Text>
        <TextInput onChangeText={setStreet} placeholder="Calle y número (opcional)" placeholderTextColor="#85918b" style={styles.input} value={street} />
        <Text style={styles.label}>Sector</Text>
        <View style={styles.sectorList}>
          {sectors.map((sector) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: selectedSectorId === sector.id }} key={sector.id} onPress={() => setSelectedSectorId(sector.id)} style={[styles.sectorChoice, selectedSectorId === sector.id && styles.selectedChoice]}>
              <Text style={[styles.choiceText, selectedSectorId === sector.id && styles.selectedText]}>{sector.name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Referencias</Text>
        <TextInput multiline onChangeText={setReferences} placeholder="Puntos de referencia para llegar" placeholderTextColor="#85918b" style={[styles.input, styles.multiline]} value={references} />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveAddress()} style={[styles.button, saving && styles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : 'Guardar dirección'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 36, gap: 14, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  addressCard: { padding: 16, borderRadius: 8, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 5 },
  cardTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  form: { marginTop: 8, padding: 17, borderRadius: 8, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 10 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700', marginBottom: 3 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 3 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 7, paddingHorizontal: 12, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  multiline: { minHeight: 78, paddingVertical: 10, textAlignVertical: 'top' },
  sectorList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorChoice: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  selectedChoice: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  choiceText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  selectedText: { color: KlippColors.blueDark },
  button: { minHeight: 48, marginTop: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: KlippColors.blue },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: '#067647', fontSize: 14 },
});