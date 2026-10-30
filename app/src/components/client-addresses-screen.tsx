import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { LocationPicker } from '@/components/location-picker';
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
    void locateCurrentPosition();
  }, []);

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

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#315BFF" /><Text style={styles.body}>Cargando tus ubicaciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#315BFF" />} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader role="client" eyebrow="PREPARA TU RESERVA" title="Mis direcciones" subtitle="Guarda los lugares donde sueles necesitar ayuda." />
      <View style={styles.introCard}>
        <View style={styles.introIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#315BFF" size={22} /></View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>Tus ubicaciones, siempre a mano</Text>
          <Text style={styles.body}>Casa, trabajo o cualquier dirección habitual. Podrás seleccionarlas al reservar.</Text>
        </View>
      </View>
      <View style={styles.listHeading}>
        <Text style={styles.sectionTitle}>Lugares guardados</Text>
        <View style={styles.countBadge}><Text style={styles.countText}>{addresses.length}</Text></View>
      </View>
      {addresses.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><SymbolView name={{ ios: 'house', android: 'home', web: 'home' }} tintColor="#315BFF" size={23} /></View>
          <Text style={styles.emptyTitle}>Aún no tienes direcciones</Text>
          <Text style={styles.body}>Guarda tu primera ubicación para que reservar sea más rápido la próxima vez.</Text>
        </View>
      ) : addresses.map((address) => (
        <View key={address.id} style={styles.addressCard}>
          <View style={styles.addressIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#315BFF" size={19} /></View>
          <View style={styles.addressCopy}>
            <View style={styles.addressTitleRow}><Text style={styles.cardTitle}>{address.label || 'Dirección guardada'}</Text><Text style={styles.savedTag}>GUARDADA</Text></View>
            {!!address.street && <Text style={styles.addressStreet}>{address.street}</Text>}
            {!!address.references_text && <Text style={styles.body}>Referencia: {address.references_text}</Text>}
          </View>
        </View>
      ))}
      <View style={styles.form}>
        <View style={styles.formHeading}>
          <View style={styles.formIcon}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#FFFFFF" size={19} /></View>
          <View><Text style={styles.sectionTitle}>Añadir una dirección</Text><Text style={styles.formSubtitle}>Completa los datos del lugar.</Text></View>
        </View>
        <Text style={styles.label}>Nombre para identificarla</Text>
        <TextInput onChangeText={setLabel} placeholder="Casa, trabajo..." placeholderTextColor="#8792A5" style={styles.input} value={label} />
        <Text style={styles.label}>Ubicación del servicio</Text>
        {coordinate ? (
          <>
            <LocationPicker coordinate={coordinate} onChange={setCoordinate} />
            <TextInput onChangeText={setStreet} placeholder="Calle, sector y ciudad" placeholderTextColor="#8792A5" style={styles.input} value={street} />
            <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
              <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} tintColor="#315BFF" size={16} /><Text style={styles.locationButtonText}>Actualizar ubicación actual</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void locateCurrentPosition()} style={styles.locationButton}>
            <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} tintColor="#315BFF" size={16} /><Text style={styles.locationButtonText}>Seleccionar ubicación en el mapa</Text>
          </Pressable>
        )}
        <Text style={styles.label}>Indicaciones / Punto de referencia</Text>
        <TextInput multiline onChangeText={setReferences} placeholder="Apto 4B, frente al colmado, portón blanco..." placeholderTextColor="#8792A5" style={[styles.input, styles.multiline]} value={references} />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveAddress()} style={[styles.button, saving && styles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : 'Guardar dirección'}</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={16} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 54, gap: 17, backgroundColor: '#F7F8FC', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#F7F8FC' },
  body: { color: '#6B778C', fontSize: 12, lineHeight: 18 },
  introCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#E0E7FF' },
  introIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 4 },
  introTitle: { color: '#203B85', fontSize: 13, fontWeight: '900' },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  sectionTitle: { color: '#15213B', fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  countBadge: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#E8EDFF' },
  countText: { color: '#315BFF', fontSize: 11, fontWeight: '900' },
  emptyCard: { alignItems: 'center', padding: 23, borderRadius: 20, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF', gap: 9 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  emptyTitle: { color: '#15213B', fontSize: 15, fontWeight: '900' },
  addressCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF' },
  addressIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  addressCopy: { flex: 1, gap: 5 },
  addressTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: '#15213B', fontSize: 14, fontWeight: '900', flex: 1 },
  savedTag: { color: '#315BFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  addressStreet: { color: '#44516A', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  form: { marginTop: 4, padding: 19, borderRadius: 21, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF', gap: 11, shadowColor: '#182B55', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 7 }, shadowRadius: 15, elevation: 2 },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 3 },
  formIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#315BFF', alignItems: 'center', justifyContent: 'center' },
  formSubtitle: { color: '#8792A5', fontSize: 10, marginTop: 2 },
  label: { color: '#334155', fontSize: 12, fontWeight: '800', marginTop: 3 },
  input: { minHeight: 49, borderWidth: 1, borderColor: '#DCE3EF', borderRadius: 12, paddingHorizontal: 13, color: '#15213B', backgroundColor: '#FFFFFF', fontSize: 14 },
  multiline: { minHeight: 78, paddingVertical: 10, textAlignVertical: 'top' },
  locationButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#EEF2FF' },
  locationButtonText: { color: '#315BFF', fontSize: 12, fontWeight: '900' },
  button: { minHeight: 51, marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: '#315BFF' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 },
  success: { color: '#067647', fontSize: 13 },
});