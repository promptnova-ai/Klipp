import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { LocationPicker } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import type { Address } from '@/lib/types';

type SavedAddress = Address;
type AddressCoordinate = { latitude: number; longitude: number };

export function ClientAddressesScreen() {
  const { session } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [coordinate, setCoordinate] = useState<AddressCoordinate | null>(null);
  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [references, setReferences] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const { data, error: addressError } = await supabase.from('addresses').select('id, client_id, label, street, references_text, location, created_at').eq('client_id', session.user.id).order('created_at', { ascending: false });
    if (addressError) {
      setError(addressError.message);
    } else {
      setAddresses((data ?? []) as SavedAddress[]);
    }
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { void loadAddresses(); }, [loadAddresses]));


  useEffect(() => {
    if (!coordinate) return;
    let active = true;
    void Location.reverseGeocodeAsync(coordinate).then((places) => {
      if (!active) return;
      const place = places[0];
      if (place) {
        const streetName = [place.street, place.streetNumber].filter(Boolean).join(' ');
        setStreet([streetName, place.district || place.subregion, place.city || place.region].filter(Boolean).join(', '));
      } else {
        setStreet(`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No pudimos encontrar la dirección de este punto.');
    });
    return () => { active = false; };
  }, [coordinate]);

  async function locateCurrentPosition() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Permite el acceso a tu ubicación para guardar una dirección por GPS.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoordinate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación actual.');
    }
  }

  async function refresh() {
    setRefreshing(true);
    await loadAddresses();
    setRefreshing(false);
  }

  async function saveAddress() {
    if (!session?.user.id || !coordinate) {
      setError('Comparte tu ubicación o ajusta el pin en el mapa.');
      return;
    }
    if (!references.trim()) {
      setError('Escribe referencias para que el profesional pueda ubicar la dirección.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const { data: addressId, error: saveError } = await supabase.rpc('save_address_at_location', {
      p_lat: coordinate.latitude,
      p_lng: coordinate.longitude,
      p_address_text: street.trim() || null,
      p_landmark_notes: references.trim(),
    });
    if (saveError) setError(saveError.message);
    else if (typeof addressId !== 'string') setError('No recibimos el identificador de la dirección guardada.');
    else {
      const labelValue = label.trim();
      const { error: labelError } = labelValue
        ? await supabase.from('addresses').update({ label: labelValue }).eq('id', addressId).eq('client_id', session.user.id)
        : { error: null };
      setLabel('');
      setReferences('');
      setCoordinate(null);
      setStreet('');
      setFormOpen(false);
      if (!labelError) setNotice('Dirección guardada.');
      await loadAddresses();
      if (labelError) setError(`La ubicación se guardó, pero no se pudo actualizar su nombre: ${labelError.message}`);
    }
    setSaving(false);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color={KlippColors.cobalt} /><Text style={styles.body}>Cargando direcciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={KlippColors.cobalt} />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="TU CUENTA" title="Mis direcciones" subtitle="Guarda ubicaciones con GPS para tus próximos servicios." />
      <View style={styles.addressHeading}><Text style={styles.sectionTitle}>Tus lugares</Text><Text style={styles.addressCount}>{addresses.length} {addresses.length === 1 ? 'ubicación guardada' : 'ubicaciones guardadas'}</Text></View>
      {addresses.length === 0 && <View style={styles.emptyAddress}><Text style={styles.emptyTitle}>Tu mapa empieza aquí</Text><Text style={styles.body}>Guarda casa, trabajo u otros lugares habituales para reservar más rápido.</Text></View>}
      {addresses.map((address) => (
        <View key={address.id} style={styles.addressRow}>
          <View style={styles.addressPin}><Text style={styles.addressPinText}>{(address.label || 'D').slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.addressCopy}>
            <Text style={styles.cardTitle}>{address.label || 'Dirección'}</Text>
            {!!address.street && <Text style={styles.body}>{address.street}</Text>}
            {!!address.references_text && <Text style={styles.addressReference}>Referencia · {address.references_text}</Text>}
          </View>
        </View>
      ))}

      <View style={styles.form}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: formOpen }} onPress={() => setFormOpen((value) => !value)} style={styles.formToggle}>
          <View><Text style={styles.formToggleTitle}>{formOpen ? 'Nueva dirección' : 'Añadir un lugar'}</Text><Text style={styles.formToggleHint}>Guarda una ubicación para tus próximas reservas</Text></View>
          <Text style={styles.formToggleAction}>{formOpen ? 'Cerrar' : '+ Añadir'}</Text>
        </Pressable>
        {formOpen && <View style={styles.formFields}>
        <Text style={styles.label}>Nombre para identificarla</Text>
        <TextInput onChangeText={setLabel} placeholder="Casa, trabajo..." placeholderTextColor={KlippColors.muted} style={styles.input} value={label} />
        <Text style={styles.label}>Ubicación del servicio</Text>
        {coordinate ? (
          <>
            <LocationPicker coordinate={coordinate} onChange={setCoordinate} />
            <TextInput onChangeText={setStreet} placeholder="Dirección aproximada" placeholderTextColor={KlippColors.muted} style={styles.input} value={street} />
            <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
              <Text style={styles.locationButtonText}>Usar mi ubicación actual</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
            <Text style={styles.locationButtonText}>Compartir ubicación para continuar</Text>
          </Pressable>
        )}
        <Text style={styles.label}>Indicaciones / Punto de referencia</Text>
        <TextInput multiline onChangeText={setReferences} placeholder="Puntos de referencia para llegar" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={references} />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveAddress()} style={[styles.button, saving && styles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : 'Guardar dirección'}</Text>
        </Pressable>
        </View>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 48, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, backgroundColor: KlippColors.canvas },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '700' },
  body: { color: KlippColors.slate, fontSize: 14, lineHeight: 21 },
  addressHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingTop: 6 },
  addressCount: { color: KlippColors.muted, fontSize: 11, fontWeight: '700' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderColor: KlippColors.border },
  addressPin: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.surfaceBlue },
  addressPinText: { color: KlippColors.cobaltDark, fontSize: 14, fontWeight: '900' },
  addressCopy: { flex: 1, minWidth: 0, gap: 5 },
  addressReference: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  emptyAddress: { paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: KlippColors.border, gap: 6 },
  emptyTitle: { color: KlippColors.ink, fontSize: 17, fontWeight: '900' },
  cardTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  form: { marginTop: 8, paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: KlippColors.border, backgroundColor: 'transparent', gap: 14 },
  formToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  formToggleTitle: { color: KlippColors.ink, fontSize: 16, fontWeight: '900' },
  formToggleHint: { color: KlippColors.muted, fontSize: 12, marginTop: 3 },
  formToggleAction: { color: KlippColors.cobaltDark, fontSize: 13, fontWeight: '900' },
  formFields: { gap: 12, paddingTop: 8 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700', marginBottom: 3 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 3 },
  input: { minHeight: 48, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 9, paddingHorizontal: 13, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  multiline: { minHeight: 78, paddingVertical: 10, textAlignVertical: 'top' },
  locationButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: KlippColors.whiteBlue },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  button: { minHeight: 50, marginTop: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: KlippColors.cobalt },
  buttonText: { color: KlippColors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: KlippColors.success, fontSize: 14 },
});