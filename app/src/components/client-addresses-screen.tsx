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
  }, [session?.user.id]);

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
    setError(null);
    setNotice(null);
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
      if (!labelError) setNotice('Dirección guardada.');
      await loadAddresses();
      if (labelError) setError(`La ubicación se guardó, pero no se pudo actualizar su nombre: ${labelError.message}`);
    }
    setSaving(false);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando direcciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={KlippColors.blue} />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="TU CUENTA" title="Mis direcciones" subtitle="Guarda tus ubicaciones para reservar servicios más rápido." />
      {addresses.length === 0 && <Text style={styles.body}>Todavía no has guardado una dirección.</Text>}
      {addresses.map((address) => (
        <View key={address.id} style={styles.addressCard}>
          <Text style={styles.cardTitle}>{address.label || 'Dirección'}</Text>
          {!!address.street && <Text style={styles.body}>{address.street}</Text>}
          {!!address.references_text && <Text style={styles.body}>Referencias: {address.references_text}</Text>}
        </View>
      ))}

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Añadir dirección</Text>
        <Text style={styles.label}>Nombre para identificarla</Text>
        <TextInput onChangeText={setLabel} placeholder="Casa, trabajo..." placeholderTextColor="#85918b" style={styles.input} value={label} />
        <Text style={styles.label}>Ubicación del servicio</Text>
        {coordinate ? (
          <>
            <LocationPicker coordinate={coordinate} onChange={setCoordinate} />
            <TextInput onChangeText={setStreet} placeholder="Dirección aproximada" placeholderTextColor="#85918b" style={styles.input} value={street} />
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
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, backgroundColor: KlippColors.canvas },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 22 },
  addressCard: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 7, shadowColor: KlippColors.navy, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 1 },
  cardTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '800' },
  form: { marginTop: 4, padding: 20, borderRadius: 22, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 12, shadowColor: KlippColors.navy, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 1 },
  sectionTitle: { color: KlippColors.navy, fontSize: 19, fontWeight: '800', letterSpacing: -0.25, marginBottom: 3 },
  label: { color: KlippColors.slate, fontSize: 12, fontWeight: '800', marginTop: 4 },
  input: { minHeight: 50, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 13, paddingHorizontal: 14, color: KlippColors.navy, backgroundColor: '#FBFCFE', fontSize: 15 },
  multiline: { minHeight: 88, paddingVertical: 12, textAlignVertical: 'top' },
  locationButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#DCE8FF' },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  button: { minHeight: 52, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: KlippColors.blue, shadowColor: KlippColors.blue, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 2 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: '#067647', fontSize: 14 },
});