import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { LocationPicker } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';
import { KlippButton, KlippCard, KlippField, KlippScreenState } from '@/design-system';
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
      if (!labelError) setNotice('Dirección guardada.');
      await loadAddresses();
      if (labelError) setError(`La ubicación se guardó, pero no se pudo actualizar su nombre: ${labelError.message}`);
    }
    setSaving(false);
  }

  if (loading) return <KlippScreenState kind="loading" title="Cargando direcciones" description="Estamos consultando tus ubicaciones guardadas." mode="light" />;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="TU CUENTA" title="Mis direcciones" subtitle="Guarda ubicaciones con GPS para tus próximos servicios." />
      {addresses.length === 0 && <KlippScreenState kind="empty" title="Aún no tienes direcciones" description="Guarda tu casa o trabajo para agilizar tus próximas reservas." mode="light" />}
      {addresses.map((address) => (
        <KlippCard key={address.id} mode="light" style={styles.addressCard}>
          <Text style={styles.cardTitle}>{address.label || 'Dirección'}</Text>
          {!!address.street && <Text style={styles.body}>{address.street}</Text>}
          {!!address.references_text && <Text style={styles.body}>Referencias: {address.references_text}</Text>}
        </KlippCard>
      ))}

      <KlippCard mode="light" style={styles.form}>
        <Text style={styles.sectionTitle}>Añadir dirección</Text>
        <KlippField label="Nombre para identificarla" onChangeText={setLabel} placeholder="Casa, trabajo..." value={label} mode="light" />
        <Text style={styles.label}>Ubicación del servicio</Text>
        {coordinate ? (
          <>
            <LocationPicker coordinate={coordinate} onChange={setCoordinate} />
            <KlippField label="Dirección aproximada" onChangeText={setStreet} placeholder="Calle, sector y ciudad" value={street} mode="light" />
            <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
              <Text style={styles.locationButtonText}>Usar mi ubicación actual</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
            <Text style={styles.locationButtonText}>Compartir ubicación para continuar</Text>
          </Pressable>
        )}
        <KlippField label="Indicaciones / punto de referencia" helper="Añade detalles que ayuden al profesional a encontrar la entrada." multiline numberOfLines={3} onChangeText={setReferences} placeholder="Ej. portón negro, frente al colmado..." style={styles.multiline} value={references} mode="light" />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
        <KlippButton label="Guardar dirección" onPress={() => void saveAddress()} loading={saving} disabled={!coordinate || !references.trim()} mode="light" />
      </KlippCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 42, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, backgroundColor: KlippColors.canvas },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  addressCard: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 7 },
  cardTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  form: { marginTop: 8, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 12 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700', marginBottom: 3 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 3 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 13, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  multiline: { minHeight: 78, paddingVertical: 10, textAlignVertical: 'top' },
  locationButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EEF4FF' },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  button: { minHeight: 48, marginTop: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.blue },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: '#067647', fontSize: 14 },
});